import type { CanaryPool, TaskInput } from "@mep/protocol";

// The compute job's input: source documents and the tools the model may call. Its
// root is the task inputRoot committed in every compute contract.
export const DEMO_TASK_INPUT = {
  kind: "mep.task-input.v1",
  task: "evidence-summary",
  instructions:
    "Extract the invoice, the liability cap, and every exhibit finding. Call sum_invoice to total the invoice. Reply with a mep.evidence-summary.v1 JSON object. Copy each exhibit finding from its source. Use this summary format: Invoice <id> totals <total> <currency>. Clause <clause> caps liability at <cap> lamports per job. Exhibit <id> shows <source finding>. Repeat the exhibit sentence for every exhibit.",
  documents: [
    {
      id: "INV-1042",
      kind: "invoice",
      text: "Invoice INV-1042\nVendor: Harbor Freight Logistics\nPallet handling 300.00\nInspection 118.20\nTotal due: 418.20 USD"
    },
    {
      id: "MSA-7",
      kind: "agreement",
      text: "Master services agreement.\nClause 7. Liability: each party's liability is capped at 5,000,000 lamports per job.\nClause 9. Disputes go to the protocol jury."
    },
    {
      id: "E-3",
      kind: "exhibit",
      text: "Exhibit E-3 (photo): a damaged pallet; the shipping label is intact."
    }
  ],
  tools: [
    {
      name: "sum_invoice",
      parameters: { invoice_id: { type: "string" }, currency: { type: "string" } },
      required: ["invoice_id", "currency"]
    }
  ]
} as const satisfies TaskInput;

/** The task output the registered stock model's reference build produces. */
export const DEMO_TASK_OUTPUT = JSON.stringify({
  schema: "mep.evidence-summary.v1",
  invoice: { id: "INV-1042", total: "418.20", currency: "USD" },
  liability: { clause: "7", capLamports: "5,000,000" },
  exhibits: [{ id: "E-3", finding: "Damaged pallet; the shipping label is intact." }],
  toolCalls: [{ tool: "sum_invoice", arguments: { invoice_id: "INV-1042", currency: "USD" } }],
  summary:
    "Invoice INV-1042 totals 418.20 USD. Clause 7 caps liability at 5,000,000 lamports per job. Exhibit E-3 shows a damaged pallet; the shipping label is intact."
});

/**
 * The controlled fault's output: degraded serving (for example a broken tool-call
 * parser or a misconfigured runtime). The cause is deliberately left generic. It
 * drops a tool argument and the liability terms and misreads the total.
 */
export const DEMO_DEGRADED_TASK_OUTPUT = JSON.stringify({
  schema: "mep.evidence-summary.v1",
  invoice: { id: "INV-1042", total: "418.00" },
  exhibits: [{ id: "E-3", finding: "Transit damage." }],
  toolCalls: [{ tool: "sum_invoice", arguments: { invoice_id: "INV-1042" } }],
  summary: "Invoice INV-1042 totals 418.00. Liability terms not found."
});

/** Canaries drawn per job from each stock model's pool. */
export const DEMO_CANARY_COUNT = 3;

// Hidden canary pools with each stock model's reference outputs. The demo models are
// deterministic fixtures, so these stand in for greedy-decoded reference outputs.
export const DEMO_CANARY_POOLS = [
  {
    kind: "mep.canary-pool.v1",
    id: "ledger-lite-pool-v1",
    stockModelId: "stock-model-ledger-lite",
    challenges: [
      {
        id: "invoice-tool-call",
        prompt: "Call the invoice tool to total invoice INV-1042 in USD.",
        referenceOutput:
          '{"tool":"sum_invoice","arguments":{"invoice_id":"INV-1042","currency":"USD"}}'
      },
      {
        id: "refund-tool-call",
        prompt: "Call the refund tool for contract C-88: 5,000,000 lamports.",
        referenceOutput:
          '{"tool":"issue_refund","arguments":{"contract":"C-88","amount":"5000000","unit":"lamports"}}'
      },
      {
        id: "vendor-tool-call",
        prompt: "Look up the vendor named on invoice INV-1042.",
        referenceOutput: '{"tool":"lookup_vendor","arguments":{"name":"Harbor Freight Logistics"}}'
      },
      {
        id: "date-extraction",
        prompt: "Return the due date in 'Net 30 from 2026-09-01' as JSON.",
        referenceOutput: '{"due_date":"2026-10-01"}'
      },
      {
        id: "liability-clause",
        prompt: "Quote the liability cap in clause 7 of the attached agreement.",
        referenceOutput: "Clause 7 caps liability at 5,000,000 lamports per job."
      },
      {
        id: "long-context-recall",
        prompt: "Which page of the 8,000-token bundle lists the delivery address?",
        referenceOutput: "Page 31 lists the delivery address."
      },
      {
        id: "clause-count",
        prompt: "How many numbered clauses does the agreement contain?",
        referenceOutput: "The agreement contains 12 numbered clauses."
      },
      {
        id: "currency-code",
        prompt: "Give the ISO 4217 code for the invoice currency.",
        referenceOutput: "USD"
      }
    ]
  },
  {
    kind: "mep.canary-pool.v1",
    id: "vision-ocr-pool-v1",
    stockModelId: "stock-model-vision-ocr",
    challenges: [
      {
        id: "receipt-total",
        prompt: "Read the total from receipt image R-77.",
        referenceOutput: '{"receipt":"R-77","total":"418.20","currency":"USD"}'
      },
      {
        id: "evidence-caption",
        prompt: "Summarize photo exhibit E-3 in one sentence.",
        referenceOutput: "Exhibit E-3 shows a damaged pallet with an intact shipping label."
      },
      {
        id: "label-barcode",
        prompt: "Read the tracking number on the shipping label in exhibit E-3.",
        referenceOutput: '{"tracking":"1Z999AA10123456784"}'
      },
      {
        id: "stamp-date",
        prompt: "Read the date stamp on receipt image R-77.",
        referenceOutput: '{"date":"2026-09-30"}'
      },
      {
        id: "signature-present",
        prompt: "Is the delivery note in exhibit E-4 signed? Answer yes or no.",
        referenceOutput: "Yes."
      }
    ]
  }
] as const satisfies readonly CanaryPool[];

// What a degraded host returns for pool prompts. Tool-call and long-context prompts
// drift; prompts not listed match the reference. Six of eight ledger-lite canaries
// drift, so any draw of three includes at least one drifted canary.
export const DEMO_DEGRADED_CANARY_OUTPUTS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "ledger-lite-pool-v1": {
    "invoice-tool-call": '{"tool":"sum_invoice","arguments":{"invoice_id":"INV-1042"}}',
    "refund-tool-call": '{"tool":"issue_refund","arguments":{"contract":"C-88"}}',
    "vendor-tool-call": '{"tool":"lookup_vendor","arguments":{}}',
    "date-extraction": '{"due_date":"2026-09-31"}',
    "long-context-recall": "Page 3 lists the delivery address.",
    "clause-count": "The agreement contains 9 numbered clauses."
  },
  "vision-ocr-pool-v1": {
    "receipt-total": '{"receipt":"R-77","total":"418.00","currency":"USD"}',
    "label-barcode": '{"tracking":"1Z999AA1012345678"}',
    "stamp-date": '{"date":"2026-09-03"}'
  }
};

/** A fixed seed for static example pages only. Live jobs draw a fresh random seed. */
export const DEMO_EXAMPLE_CANARY_SEED = "5eed".repeat(16);
