#!/usr/bin/env python3
"""
Fine-tune DeepSeek-Coder-1.3B-Instruct for React test generation.

HOW TO USE:
  1. Open Google Colab (colab.research.google.com)
  2. Set runtime to GPU: Runtime → Change runtime type → T4 GPU
  3. Upload your training.jsonl to Colab (or Google Drive)
  4. Copy-paste each section below into separate Colab cells
  5. Run cells sequentially

Training takes ~1-2 hours on a free T4 GPU for 30-50 examples.
"""

# ═══════════════════════════════════════════════════════════════════════
# CELL 1: Install Dependencies (~3 minutes)
# ═══════════════════════════════════════════════════════════════════════

# !pip install -q torch transformers datasets peft accelerate bitsandbytes
# !pip install -q trl wandb   # trl for SFTTrainer, wandb optional for logging

# ═══════════════════════════════════════════════════════════════════════
# CELL 2: Imports & Config
# ═══════════════════════════════════════════════════════════════════════

import json
import torch
from pathlib import Path
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

# ── Configuration ──────────────────────────────────────────────────
MODEL_NAME = "deepseek-ai/deepseek-coder-1.3b-instruct"
# Alternative for better quality (needs more VRAM):
# MODEL_NAME = "deepseek-ai/deepseek-coder-6.7b-instruct"

TRAINING_FILE = "training.jsonl"  # Upload this to Colab
OUTPUT_DIR = "./react-testgen-lora"
MERGED_DIR = "./react-testgen-merged"

# Training hyperparams (tuned for small datasets of 30-100 examples)
EPOCHS = 4              # More epochs for small datasets
BATCH_SIZE = 1          # Keep at 1 for free Colab T4 (16GB VRAM)
GRADIENT_ACCUM = 4      # Effective batch size = 1 * 4 = 4
LEARNING_RATE = 2e-4    # Standard for LoRA
MAX_SEQ_LENGTH = 4096   # Covers most component+test pairs
LORA_R = 16             # LoRA rank (higher = more capacity)
LORA_ALPHA = 32         # LoRA scaling
LORA_DROPOUT = 0.05

print(f"🔧 Config: {MODEL_NAME}")
print(f"   Epochs: {EPOCHS}, LR: {LEARNING_RATE}, LoRA r={LORA_R}")
print(f"   GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'}")
print(f"   VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB" if torch.cuda.is_available() else "")


# ═══════════════════════════════════════════════════════════════════════
# CELL 3: Load & Prepare Dataset
# ═══════════════════════════════════════════════════════════════════════

def load_training_data(filepath):
    """Load JSONL and convert to ChatML formatted strings."""
    examples = []
    with open(filepath, 'r') as f:
        for line in f:
            if not line.strip():
                continue
            data = json.loads(line)
            messages = data['messages']

            # Format as ChatML (DeepSeek's native format)
            formatted = ""
            for msg in messages:
                role = msg['role']
                content = msg['content']
                if role == 'system':
                    formatted += f"<|system|>\n{content}\n"
                elif role == 'user':
                    formatted += f"<|user|>\n{content}\n"
                elif role == 'assistant':
                    formatted += f"<|assistant|>\n{content}\n"

            formatted += "<|end|>"
            examples.append({"text": formatted})

    return examples

# Load data
raw_data = load_training_data(TRAINING_FILE)
dataset = Dataset.from_list(raw_data)

print(f"✅ Loaded {len(dataset)} training examples")
print(f"   Average text length: {sum(len(x['text']) for x in raw_data) // len(raw_data)} chars")
print(f"   Sample preview (first 200 chars):\n   {raw_data[0]['text'][:200]}...")


# ═══════════════════════════════════════════════════════════════════════
# CELL 4: Load Model with 4-bit Quantization
# ═══════════════════════════════════════════════════════════════════════

# 4-bit quantization config (allows training on free T4 with 16GB VRAM)
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

print(f"📥 Loading {MODEL_NAME}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)

# Set padding token
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
    model.config.pad_token_id = tokenizer.eos_token_id

# Prepare for LoRA training
model = prepare_model_for_kbit_training(model)
model.config.use_cache = False  # Required for gradient checkpointing

print(f"✅ Model loaded: {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M parameters")


# ═══════════════════════════════════════════════════════════════════════
# CELL 5: Configure LoRA
# ═══════════════════════════════════════════════════════════════════════

lora_config = LoraConfig(
    r=LORA_R,
    lora_alpha=LORA_ALPHA,
    lora_dropout=LORA_DROPOUT,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
)

model = get_peft_model(model, lora_config)

trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
total_params = sum(p.numel() for p in model.parameters())
print(f"✅ LoRA configured:")
print(f"   Trainable: {trainable_params / 1e6:.2f}M ({100 * trainable_params / total_params:.2f}%)")
print(f"   Total: {total_params / 1e6:.1f}M")


# ═══════════════════════════════════════════════════════════════════════
# CELL 6: Train!
# ═══════════════════════════════════════════════════════════════════════

training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRADIENT_ACCUM,
    learning_rate=LEARNING_RATE,
    weight_decay=0.01,
    warmup_ratio=0.1,
    lr_scheduler_type="cosine",
    logging_steps=5,
    save_strategy="epoch",
    save_total_limit=2,
    fp16=True,
    gradient_checkpointing=True,
    optim="paged_adamw_8bit",
    max_grad_norm=0.3,
    report_to="none",  # Change to "wandb" if you want logging
    dataloader_pin_memory=False,
)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    args=training_args,
    max_seq_length=MAX_SEQ_LENGTH,
    dataset_text_field="text",
    packing=False,
)

print("🚀 Starting training...")
print(f"   Steps per epoch: {len(dataset) // (BATCH_SIZE * GRADIENT_ACCUM)}")
print(f"   Total steps: ~{EPOCHS * len(dataset) // (BATCH_SIZE * GRADIENT_ACCUM)}")

trainer.train()
print("✅ Training complete!")


# ═══════════════════════════════════════════════════════════════════════
# CELL 7: Save LoRA Adapter
# ═══════════════════════════════════════════════════════════════════════

# Save LoRA adapter weights (~50-100MB)
trainer.model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print(f"✅ LoRA adapter saved to {OUTPUT_DIR}")


# ═══════════════════════════════════════════════════════════════════════
# CELL 8: Merge & Export Full Model
# ═══════════════════════════════════════════════════════════════════════

from peft import PeftModel

# Reload base model in full precision for merging
print("📥 Reloading base model for merging...")
base_model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16,
    device_map="auto",
    trust_remote_code=True,
)

# Load and merge LoRA
merged_model = PeftModel.from_pretrained(base_model, OUTPUT_DIR)
merged_model = merged_model.merge_and_unload()

# Save merged model
merged_model.save_pretrained(MERGED_DIR)
tokenizer.save_pretrained(MERGED_DIR)
print(f"✅ Merged model saved to {MERGED_DIR}")


# ═══════════════════════════════════════════════════════════════════════
# CELL 9: Quick Test Before Export
# ═══════════════════════════════════════════════════════════════════════

test_prompt = """<|system|>
You are a React testing expert. You generate comprehensive Jest + React Testing Library test files for React components. Your tests are production-quality, use best practices, and achieve high code coverage.
<|user|>
Generate a comprehensive Jest + React Testing Library test file for the following React component.
The tests should achieve at least 50% code coverage.

## Component: Spinner

## Props
- size: string [optional] (default: 'md')
- className: string [optional]

## Source Code
```tsx
export function Spinner({ size = 'md', className }: { size?: string; className?: string }) {
  return <div className={`spinner spinner-${size} ${className || ''}`} role="status" aria-label="Loading" />;
}
```

## Test Requirements
- Use renderWithProviders from test-utils
- Use screen queries
- Each test should assert something meaningful
<|assistant|>
"""

inputs = tokenizer(test_prompt, return_tensors="pt").to(merged_model.device)
with torch.no_grad():
    outputs = merged_model.generate(
        **inputs,
        max_new_tokens=1500,
        temperature=0.3,
        top_p=0.9,
        do_sample=True,
        repetition_penalty=1.1,
    )

response = tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
print("🧪 Test generation sample:")
print(response[:2000])


# ═══════════════════════════════════════════════════════════════════════
# CELL 10: Convert to GGUF for Ollama (Local Inference)
# ═══════════════════════════════════════════════════════════════════════

# Install llama.cpp converter
# !pip install -q llama-cpp-python
# !git clone --depth 1 https://github.com/ggerganov/llama.cpp.git
# !pip install -q -r llama.cpp/requirements/requirements-convert_hf_to_gguf.txt

# Convert to GGUF Q4_K_M (good balance of quality vs size, ~0.8GB for 1.3B model)
# !python llama.cpp/convert_hf_to_gguf.py {MERGED_DIR} --outfile react-testgen.gguf --outtype q4_k_m

print("✅ GGUF model created: react-testgen.gguf")
print("📥 Download this file and use with Ollama locally:")
print("   1. Download react-testgen.gguf from Colab files panel")
print("   2. Create a Modelfile (see inference/Modelfile in the project)")
print("   3. Run: ollama create react-testgen -f Modelfile")


# ═══════════════════════════════════════════════════════════════════════
# CELL 11: Download Files
# ═══════════════════════════════════════════════════════════════════════

# Download the GGUF file (easiest method for Colab)
# from google.colab import files
# files.download("react-testgen.gguf")

# Or save to Google Drive:
# from google.colab import drive
# drive.mount('/content/drive')
# !cp react-testgen.gguf /content/drive/MyDrive/
