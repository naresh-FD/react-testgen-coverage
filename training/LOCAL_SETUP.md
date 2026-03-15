# Local Anaconda Setup

This repo can now run fully locally with Anaconda or Miniconda.

## 1. Create the environment

```bash
conda env create -f environment.yml
conda activate react-testgen
python -m ipykernel install --user --name react-testgen --display-name "Python (react-testgen)"
```

## 2. Open the repo in VS Code

- Open the workspace in VS Code
- Open either `react-testgen-train.ipynb` or `react_testgen_train.ipynb`
- Select the `Python (react-testgen)` kernel

## 3. Dataset location

For local notebook runs, the notebook now looks in this order:

1. `training.jsonl` in the repo root
2. `data/processed/training.jsonl`

The CLI trainer defaults to:

`data/processed/training.jsonl`

## 4. Run training locally

Notebook path:

- Run the notebook top to bottom in VS Code or JupyterLab

CLI path:

```bash
python training/finetune_local.py --training-file data/processed/training.jsonl
```

Skip merged-model export if you only want the LoRA adapter:

```bash
python training/finetune_local.py --training-file data/processed/training.jsonl --skip-merge
```

## 5. Convert for Ollama

After a merged model is created, convert it to GGUF:

```bash
python -m pip install llama-cpp-python
git clone --depth 1 https://github.com/ggerganov/llama.cpp output/llama_cpp
python output/llama_cpp/convert_hf_to_gguf.py output/react-testgen-merged --outfile output/react-testgen.gguf --outtype q4_K_M
```

Then use your existing `inference/Modelfile`.

## Notes

- Local training is realistic only with an NVIDIA GPU and CUDA.
- On Windows, `bitsandbytes` is most reliable under WSL2.
- If you do not have a usable GPU, keep local editing/inference and train in a remote GPU environment instead.
