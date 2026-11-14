# Cerebras for transcript risk detection

Research checked 2026-11-14. This note records capability findings and proposed experiments; it does not choose a production model, interface, or alert policy.

## Verified capabilities

- Cerebras Inference supports schema-constrained responses through `response_format` with `type: "json_schema"` and `strict: true`. Strict mode supports a subset of JSON Schema; each object must set `additionalProperties: false`. This can enforce the shape of an assessment, but cannot establish that the assessment or its confidence is correct. Verify compatibility against the selected model before implementation. [Official structured-output documentation](https://inference-docs.cerebras.ai/capabilities/structured-outputs)
- Cerebras response streaming emits generated output chunks through `stream: true`. This describes output streaming, not a persistent live-transcript ingestion API. Feeding successive transcript snapshots or windows into assessments is an application design choice. [Official streaming documentation](https://inference-docs.cerebras.ai/capabilities/streaming)
- The public pricing table distinguishes self-serve Developer inference from Enterprise customization: custom weights and fine-tuning/training services are listed for Enterprise, available by agreement. Do not assume an ordinary inference API key includes self-serve fine-tuning. [Official pricing](https://www.cerebras.ai/pricing)
- Dedicated Inference documents serving custom fine-tuned weights. Cerebras also documents a separate Model Zoo training workflow that starts from a checkpoint and configures training and validation. Serving custom weights and obtaining training access are separate matters to confirm with Cerebras. [Dedicated Inference](https://inference-docs.cerebras.ai/dedicated/overview), [Fine-tuning with validation](https://training-api.cerebras.ai/en/latest/wsc/Model-zoo/core_workflows/finetuning.html)

## Recommended experiment sequence

The following is engineering guidance inferred from the task, rather than a vendor guarantee or a settled specification.

1. Start with an existing instruction-following model and a fixed prompt. Define the social-engineering rubric, include benign counterexamples, permit an insufficient-evidence result, and ask for concise transcript evidence. Treat transcript text as untrusted data: instructions spoken by participants must not override the assessment task. Request structured fields for the assessment, supporting evidence, and an explicitly uncalibrated raw score. Prompting changes the input instructions, not model weights.
2. Build a labelled evaluation set before fine-tuning. Include attack and ordinary conversations, legitimate urgent requests, ambiguous cases, and realistic transcription errors. Label prefixes of conversations using only what was available at that point. A final malicious outcome must not automatically turn an innocuous opening into a positive example. Keep all prefixes from the same conversation in one split; where possible also separate recurring scripts, speakers, and organizations to reduce leakage.
3. Establish a prompt baseline on held-out conversations. Measure missed attacks, false alerts per conversation or time interval, time to first useful alert, score stability, and latency under expected update frequency. Whole-conversation accuracy alone cannot show whether early warnings work. Use actual traffic prevalence or report how prevalence differs from the evaluation set.
4. If labelled errors show persistent behavior gaps, use training examples pairing each transcript prefix with the desired assessment and evidence. Confirm training access, supported architecture, data format, and serving compatibility with Cerebras before choosing a fine-tuning workflow. Compare any fine-tuned candidate against the fixed baseline on the same untouched test set; training from scratch is not the natural starting point for this component.

## Confidence requires separate validation

Define the event the score estimates before calling it a probability: current observable social-engineering behavior and eventual conversation outcome are different targets. A model-generated `0.9` is initially a score, not evidence of 90% correctness.

Guo et al. distinguish classification accuracy from probability calibration and demonstrate post-processing calibration, including temperature scaling, on held-out data. Their experiments concern neural classifiers, not the reliability of an LLM's written confidence number. Temperature scaling requires suitable logits; a chat model's generated number does not become a class probability merely because the API exposes token likelihoods. [Original ICML paper](https://proceedings.mlr.press/v70/guo17a.html)

Recommended application: reserve separate conversation-level calibration data, fit an appropriate score-to-outcome mapping, and inspect reliability alongside precision/recall and false-alert rates on an untouched test set. Select alert thresholds using the cost of missed attacks and false alerts. Recheck calibration after changing the model, prompt, transcript window, or input population. Calibration may improve probability estimates without fixing the detector's underlying classification errors; no particular calibration method is guaranteed to work here.
