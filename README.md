# React Test Generator — Fine-Tuned LLM

A locally-runnable fine-tuned LLM that reads React TSX components and generates
Jest + React Testing Library tests with 50%+ coverage.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 TRAINING PHASE (Local Conda)                │
│                                                             │
│  TSX Components ──► AST Analyzer ──► Structured Metadata    │
│        +                                                    │
│  Hand-written    ──► Training Pairs ──► LoRA Fine-tune      │
│  Test Examples       (JSONL)            DeepSeek-Coder-1.3B │
│                                                             │
│  Output: LoRA adapter weights (~50MB)                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   INFERENCE PHASE (Local 8GB)                │
│                                                             │
│  New TSX File ──► AST Analyzer ──► Prompt Builder           │
│                                          │                  │
│                                          ▼                  │
│                                    Ollama / llama.cpp       │
│                                    (Quantized GGUF ~1.5GB)  │
│                                          │                  │
│                                          ▼                  │
│                                    Generated .test.tsx      │
└─────────────────────────────────────────────────────────────┘
```

## Timeline (1-2 Weeks)

| Day   | Task                                    | Hours |
|-------|-----------------------------------------|-------|
| 1-2   | Write 30-50 manual component→test pairs | 6-8h  |
| 3     | Run data pipeline, create JSONL dataset | 2-3h  |
| 4-5   | Fine-tune locally (LoRA)                | 3-4h  |
| 6     | Convert to GGUF, test locally           | 2-3h  |
| 7     | Evaluate, fix bad outputs, retrain      | 3-4h  |
| 8-10  | Iterate: add more examples, retrain     | 4-6h  |

**Total: ~25-30 hours over 1.5-2 weeks**

## Quick Start

### Step 1: Prepare Training Data
```bash
cd react-testgen-llm

# Install dependencies
npm install typescript

# Generate training pairs from your project
node scripts/prepare-data.mjs --src ../expence_manager/src --out data/processed

# Review & edit the generated pairs
# Add your manual examples to data/manual-examples/
```

### Step 2: Fine-Tune Locally
1. Create the local conda environment: `conda env create -f environment.yml`
2. Activate it: `conda activate react-testgen`
3. Open `react-testgen-train.ipynb` in VS Code or JupyterLab
4. Select the `react-testgen` kernel
5. Run all cells, or use `python training/finetune_local.py --training-file data/processed/training.jsonl`

### Step 3: Run Locally
```bash
# Install Ollama (https://ollama.ai)
ollama create react-testgen -f inference/Modelfile

# Generate tests
node scripts/generate.mjs --file ../your-project/src/MyComponent.tsx
node scripts/generate.mjs --dir ../your-project/src/components
```

## Local Workflow

Use the existing `react-testgen-train.ipynb` notebook locally in VS Code or JupyterLab, or use the CLI trainer.

Recommended flow:

- edit locally in VS Code
- activate the `react-testgen` conda environment
- open `react-testgen-train.ipynb` locally
- run the notebook cells or `training/finetune_local.py`
- convert the merged model to GGUF and run it with Ollama

Setup details:

- `environment.yml`
- `training/LOCAL_SETUP.md`
- `training/finetune_local.py`

## Requirements

- Node.js 18+
- TypeScript (npm install)
- Anaconda or Miniconda
- NVIDIA GPU recommended for local training
- Ollama (for local inference)
- ~2GB disk space for the model
"# react-testgen-coverage" 
