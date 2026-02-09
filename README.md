# React Test Generator — Fine-Tuned LLM

A locally-runnable fine-tuned LLM that reads React TSX components and generates
Jest + React Testing Library tests with 50%+ coverage.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TRAINING PHASE (Colab)                  │
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
| 4-5   | Fine-tune on Colab (LoRA)               | 3-4h  |
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

### Step 2: Fine-Tune (Google Colab)
1. Upload `data/processed/training.jsonl` to Google Drive
2. Open `training/finetune_colab.ipynb` in Colab
3. Select GPU runtime (T4 free tier)
4. Run all cells (~1-2 hours training)
5. Download the merged GGUF model

### Step 3: Run Locally
```bash
# Install Ollama (https://ollama.ai)
ollama create react-testgen -f inference/Modelfile

# Generate tests
node scripts/generate.mjs --file ../your-project/src/MyComponent.tsx
node scripts/generate.mjs --dir ../your-project/src/components
```

## Requirements

- Node.js 18+
- TypeScript (npm install)
- Google account (for free Colab GPU)
- Ollama (for local inference)
- ~2GB disk space for the model
"# react-testgen-coverage" 
