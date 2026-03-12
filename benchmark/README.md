# LLM Derby Benchmark Runner

Run MMLU-Pro Hard benchmarks and export results for the LLM Derby race visualization.

## Setup

```bash
pip install openai datasets tqdm
```

## Running on DGX Spark

1. Start your model with vLLM:
```bash
vllm serve meta-llama/Llama-3.1-8B-Instruct --port 8000
```

2. Run the benchmark:
```bash
python run_mmlu_pro.py \
    --model meta-llama/Llama-3.1-8B-Instruct \
    --model-name "Llama 3.1 8B" \
    --api-url http://localhost:8000/v1 \
    --output results/llama-3.1-8b.json \
    --num-questions 300
```

3. Copy the output JSON into `js/data.js` to replace the simulated data.

## Output Format

```json
{
    "model": "Llama 3.1 8B",
    "questions": [
        {"q": 1, "subject": "Physics", "correct": true, "tokens": 67, "time_ms": 1340},
        ...
    ],
    "summary": {
        "total": 300,
        "correct": 133,
        "accuracy": 0.443,
        "avg_tps": 50.9
    }
}
```

## Models to benchmark

| Model | Display Name | Notes |
|-------|-------------|-------|
| `meta-llama/Llama-3.2-3B-Instruct` | Llama 3.2 3B | Base 3B |
| `meta-llama/Llama-3.1-8B-Instruct` | Llama 3.1 8B | Base 8B |
| Qre Llama 3B | Qre Llama 3B | Qwerky SSM-optimized 3B |
| Qre Llama 8B | Qre Llama 8B | Qwerky SSM-optimized 8B |
