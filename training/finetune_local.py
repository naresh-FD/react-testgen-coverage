#!/usr/bin/env python3
"""Local CLI fine-tuning entry point for the react-testgen model."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from trl import SFTTrainer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model-name",
        default="Qwen/Qwen2.5-Coder-1.5B-Instruct",
        help="Base model to fine-tune.",
    )
    parser.add_argument(
        "--training-file",
        default="data/processed/training.jsonl",
        help="Path to the JSONL training file.",
    )
    parser.add_argument(
        "--output-dir",
        default="output/react-testgen-lora",
        help="Where to save the LoRA adapter.",
    )
    parser.add_argument(
        "--merged-dir",
        default="output/react-testgen-merged",
        help="Where to save the merged model.",
    )
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--max-seq-length", type=int, default=4096)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument(
        "--skip-merge",
        action="store_true",
        help="Skip merging the LoRA adapter back into the base model.",
    )
    return parser.parse_args()


def ensure_supported_runtime() -> None:
    if not torch.cuda.is_available():
        raise RuntimeError(
            "Local training requires an NVIDIA GPU with CUDA. For Windows, WSL2 is the safest path for bitsandbytes."
        )


def compute_dtype() -> torch.dtype:
    if hasattr(torch.cuda, "is_bf16_supported") and torch.cuda.is_bf16_supported():
        return torch.bfloat16
    return torch.float16


def load_training_data(filepath: Path) -> list[dict[str, str]]:
    examples: list[dict[str, str]] = []
    with filepath.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            data = json.loads(line)
            formatted = ""
            for msg in data["messages"]:
                role = msg["role"]
                content = msg["content"]
                if role == "system":
                    formatted += f"<|system|>\n{content}\n"
                elif role == "user":
                    formatted += f"<|user|>\n{content}\n"
                elif role == "assistant":
                    formatted += f"<|assistant|>\n{content}\n"
            formatted += "<|end|>"
            examples.append({"text": formatted})

    if not examples:
        raise ValueError(f"No training examples found in {filepath}")
    return examples


def main() -> None:
    args = parse_args()
    ensure_supported_runtime()

    dtype = compute_dtype()
    training_file = Path(args.training_file).resolve()
    output_dir = Path(args.output_dir).resolve()
    merged_dir = Path(args.merged_dir).resolve()

    output_dir.mkdir(parents=True, exist_ok=True)
    merged_dir.mkdir(parents=True, exist_ok=True)

    print(f"Model: {args.model_name}")
    print(f"Training file: {training_file}")
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Compute dtype: {dtype}")

    raw_data = load_training_data(training_file)
    dataset = Dataset.from_list(raw_data)
    print(f"Loaded {len(dataset)} training examples")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=dtype,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(args.model_name, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        model.config.pad_token_id = tokenizer.eos_token_id

    model = prepare_model_for_kbit_training(model)
    model.config.use_cache = False

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    )
    model = get_peft_model(model, lora_config)

    use_bf16 = dtype == torch.bfloat16
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        logging_steps=5,
        save_strategy="epoch",
        save_total_limit=2,
        fp16=not use_bf16,
        bf16=use_bf16,
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",
        max_grad_norm=0.3,
        report_to="none",
        dataloader_pin_memory=False,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=training_args,
        max_seq_length=args.max_seq_length,
        dataset_text_field="text",
        packing=False,
    )

    print("Starting training")
    trainer.train()

    trainer.model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print(f"Saved LoRA adapter to {output_dir}")

    if args.skip_merge:
        return

    print("Merging LoRA weights into the base model")
    base_model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        torch_dtype=dtype,
        device_map="auto",
        trust_remote_code=True,
    )
    merged_model = PeftModel.from_pretrained(base_model, output_dir)
    merged_model = merged_model.merge_and_unload()
    merged_model.save_pretrained(merged_dir)
    tokenizer.save_pretrained(merged_dir)
    print(f"Saved merged model to {merged_dir}")


if __name__ == "__main__":
    main()
