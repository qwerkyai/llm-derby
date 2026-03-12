#!/usr/bin/env python3
"""
run_mmlu_pro.py — Run MMLU-Pro Hard benchmark and export results for LLM Derby

This script runs a model through the MMLU-Pro Hard benchmark (300 questions,
10-way MCQ) and outputs a JSON file compatible with the LLM Derby race
visualization.

Intended to be run on NVIDIA DGX Spark with vLLM or TGI serving the model.

Usage:
    python run_mmlu_pro.py \
        --model meta-llama/Llama-3.1-8B-Instruct \
        --api-url http://localhost:8000/v1 \
        --output results/llama-3.1-8b.json \
        --num-questions 300

Requirements:
    pip install openai datasets tqdm

The output JSON has the format expected by js/data.js:
    {
        "model": "Llama 3.1 8B",
        "questions": [
            {
                "q": 1,
                "subject": "Physics",
                "correct": true,
                "tokens": 67,
                "time_ms": 1340
            },
            ...
        ],
        "summary": {
            "total": 300,
            "correct": 133,
            "accuracy": 0.443,
            "avg_tokens": 65.2,
            "avg_time_ms": 1280.5,
            "avg_tps": 50.9
        }
    }
"""

import argparse
import json
import time
import sys
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    print("Please install openai: pip install openai")
    sys.exit(1)

try:
    from datasets import load_dataset
except ImportError:
    print("Please install datasets: pip install datasets")
    sys.exit(1)

try:
    from tqdm import tqdm
except ImportError:
    tqdm = lambda x, **kw: x  # fallback: no progress bar


# MMLU-Pro uses 10 answer options (A-J)
OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]


def load_mmlu_pro(split="test", num_questions=300, seed=42):
    """Load MMLU-Pro dataset from HuggingFace and sample questions."""
    print(f"Loading MMLU-Pro dataset (split={split})...")
    ds = load_dataset("TIGER-Lab/MMLU-Pro", split=split)

    # Shuffle deterministically and take N questions
    ds = ds.shuffle(seed=seed).select(range(min(num_questions, len(ds))))
    return ds


def format_question(item):
    """Format a single MMLU-Pro question as a prompt string."""
    question = item["question"]
    options = item["options"]

    prompt = f"Question: {question}\n\nOptions:\n"
    for i, opt in enumerate(options):
        if i < len(OPTIONS):
            prompt += f"  {OPTIONS[i]}. {opt}\n"

    prompt += (
        "\nAnswer with ONLY the letter of the correct option (A-J). "
        "Do not explain."
    )
    return prompt


def extract_answer(response_text):
    """Extract the answer letter from model response."""
    text = response_text.strip().upper()

    # Try to find a single letter answer
    for char in text:
        if char in OPTIONS:
            return char

    return None


def run_benchmark(client, model_id, dataset, temperature=0.0):
    """Run the benchmark and return per-question results."""
    results = []

    for i, item in enumerate(tqdm(dataset, desc="Running benchmark")):
        prompt = format_question(item)
        correct_answer = item["answer"]
        subject = item.get("category", item.get("subject", "Other"))

        # Time the inference
        start = time.perf_counter()
        try:
            response = client.chat.completions.create(
                model=model_id,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful assistant. Answer multiple choice "
                            "questions with only the letter of the correct answer."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=10,
                temperature=temperature,
            )
            elapsed_ms = (time.perf_counter() - start) * 1000

            model_answer = extract_answer(
                response.choices[0].message.content or ""
            )
            tokens = response.usage.completion_tokens if response.usage else 1
            is_correct = model_answer == correct_answer

        except Exception as e:
            print(f"\nError on question {i+1}: {e}")
            elapsed_ms = 5000
            tokens = 1
            is_correct = False

        results.append(
            {
                "q": i + 1,
                "subject": subject,
                "correct": is_correct,
                "tokens": tokens,
                "time_ms": round(elapsed_ms),
            }
        )

    return results


def summarize(results):
    """Compute summary statistics."""
    total = len(results)
    correct = sum(1 for r in results if r["correct"])
    avg_tokens = sum(r["tokens"] for r in results) / total
    avg_time = sum(r["time_ms"] for r in results) / total
    avg_tps = sum(r["tokens"] / (r["time_ms"] / 1000) for r in results) / total

    return {
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total, 3),
        "avg_tokens": round(avg_tokens, 1),
        "avg_time_ms": round(avg_time, 1),
        "avg_tps": round(avg_tps, 1),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Run MMLU-Pro Hard benchmark for LLM Derby"
    )
    parser.add_argument(
        "--model",
        required=True,
        help="Model ID (e.g., meta-llama/Llama-3.1-8B-Instruct)",
    )
    parser.add_argument(
        "--model-name",
        help="Display name for the model (e.g., 'Llama 3.1 8B'). "
        "Defaults to last part of model ID.",
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:8000/v1",
        help="OpenAI-compatible API URL (default: http://localhost:8000/v1)",
    )
    parser.add_argument(
        "--api-key",
        default="not-needed",
        help="API key (default: not-needed for local vLLM/TGI)",
    )
    parser.add_argument(
        "--output",
        default="results/benchmark.json",
        help="Output JSON file path",
    )
    parser.add_argument(
        "--num-questions",
        type=int,
        default=300,
        help="Number of questions to run (default: 300)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for question selection (default: 42)",
    )

    args = parser.parse_args()

    # Setup client
    client = OpenAI(base_url=args.api_url, api_key=args.api_key)
    model_name = args.model_name or args.model.split("/")[-1]

    print(f"Model: {model_name}")
    print(f"API:   {args.api_url}")
    print(f"Questions: {args.num_questions}")
    print()

    # Load dataset
    dataset = load_mmlu_pro(
        num_questions=args.num_questions, seed=args.seed
    )
    print(f"Loaded {len(dataset)} questions\n")

    # Run benchmark
    results = run_benchmark(client, args.model, dataset)
    summary = summarize(results)

    # Output
    output = {"model": model_name, "questions": results, "summary": summary}

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2))

    print(f"\nResults saved to {args.output}")
    print(f"Accuracy: {summary['correct']}/{summary['total']} ({summary['accuracy']*100:.1f}%)")
    print(f"Avg tokens/s: {summary['avg_tps']}")
    print(f"Avg time/question: {summary['avg_time_ms']:.0f}ms")


if __name__ == "__main__":
    main()
