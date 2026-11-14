# Conversation memory: current behavior

The engine maintains call state in its in-process Detector instance. Each assessment sends the selected transcript segments in the user message with the system prompt; it does not rely on a server-side Cerebras conversation/session ID or re-send prior assistant assessments as history.

The context sent for a call is the deduplicated, time-sorted union of:

- the latest 40 retained ordinary finalized segments by default;
- accepted finalized segments that have not yet been successfully assessed;
- evidence retained by unresolved warnings.

Pending/evidence capacity limits still apply; excess input is rejected visibly rather than silently accepted. Unresolved warnings persist within a call. Calls are isolated. Ending a call removes its state, and process restart loses it. There is no durable transcript database, full-call summary, retrieval store, or provider-managed memory layer in this integration.

## Verified offline

`tests/context-memory.test.ts` uses the real Detector context-selection path with an injected provider, not paid inference:

1. Earlier tool mention and later installation request both reach the provider, while a second call receives no first-call transcript or warnings.
2. After 42 separately assessed ordinary turns, the current provider context has exactly turns 3–42; the early tool mention is absent.
3. An unsafe first turn retained as rule warning evidence is still supplied after 42 turns, even outside the ordinary window.

These tests establish bounded context and retention behavior, not unlimited semantic memory or real-world detection accuracy. Early setup that was assessed as harmless can be forgotten after the ordinary window expires; a later ambiguous pronoun can then lack its antecedent. The current live multi-turn robustness fixtures are short and do not establish long-call robustness.

## Provider references

The [Cerebras Chat Completions API](https://inference-docs.cerebras.ai/api-reference/chat-completions) takes a messages array representing the conversation supplied with the request. Cerebras's [conversation memory example](https://github.com/Cerebras/inference-examples/blob/main/conversational-memory-langchain/README.md) implements memory in the application with LangChain. This engine similarly manages its own context, using the bounded retention above.
