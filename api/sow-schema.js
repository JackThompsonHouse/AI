"use strict";

// JSON Schema used both as the Anthropic tool's input_schema (forces
// structured output matching this shape) and as the source of truth for
// what the frontend review form renders. Keep this in sync with
// templates/build_template.py's {tag} placeholders if either changes -
// the docx template's tags are dotted paths into this same shape.

const SOW_SCHEMA = {
  type: "object",
  required: [
    "documentInfo", "executiveSummary", "currentEnvironment",
    "solutionSummary", "rocServices", "commercialSummary",
  ],
  properties: {
    documentInfo: {
      type: "object",
      required: ["proposalTitle", "clientName", "projectName", "documentAuthor"],
      properties: {
        proposalTitle: { type: "string", description: "Cover page title, e.g. 'Network Refresh Proposal'" },
        clientName: { type: "string" },
        projectName: { type: "string" },
        documentAuthor: { type: "string", description: "Roc author name(s)" },
        proposalReference: { type: "string", description: "Ties to the quote reference used in Commercial Summary" },
        contactName: { type: "string" },
        contactPhone: { type: "string" },
        contactEmail: { type: "string" },
      },
    },
    executiveSummary: {
      type: "object",
      required: ["backgroundAndContext", "nextSteps"],
      properties: {
        backgroundAndContext: { type: "string", description: "Paragraph(s): who the customer is, why this proposal, their need/objectives, key context" },
        nextSteps: { type: "string", description: "Paragraph: what happens after the customer reviews this (PO, workshop, etc.)" },
      },
    },
    currentEnvironment: {
      type: "object",
      required: ["requirementsSummary"],
      properties: {
        overview: { type: "string", description: "Current environment overview - TBC if not covered in transcript" },
        currentServicesOverview: { type: "string", description: "Only relevant for Managed Service opportunities - TBC if not applicable" },
        requirementsSummary: { type: "string", description: "Paragraph: challenges, pain points, requirements and business impact" },
      },
    },
    solutionSummary: {
      type: "object",
      required: ["overview"],
      properties: {
        overview: { type: "string", description: "Proposed solution description, why it fits the need" },
        components: { type: "string", description: "Technical components / software / hardware, as a paragraph" },
      },
    },
    rocServices: {
      type: "object",
      required: ["engagementApproach", "pricingBasis"],
      properties: {
        engagementApproach: { type: "string", description: "What/why/how of delivery approach" },
        serviceTransition: { type: "string", description: "How solution/service is handed over into support" },
        pricingBasis: {
          type: "string",
          enum: ["milestone", "time_and_materials"],
          description: "Governs which pricing table/section variant is used. Default to time_and_materials if genuinely unclear.",
        },
        milestones: {
          type: "array",
          description: "Only used when pricingBasis is 'milestone'",
          items: {
            type: "object",
            required: ["name", "percentCharge"],
            properties: {
              name: { type: "string" },
              completionDate: { type: "string", description: "Date or 'TBD'" },
              percentCharge: { type: "string", description: "e.g. '30%'" },
            },
          },
        },
        customerAssumptions: {
          type: "array",
          description: "Deal-specific assumptions/dependencies ADDED to (not replacing) the template's standard bullet list",
          items: { type: "string" },
        },
      },
    },
    serviceOverview: {
      type: "object",
      description: "Whole section is optional - only include if there's a Managed Service/support element",
      properties: {
        include: { type: "boolean" },
        serviceQuality: { type: "string" },
        itilServices: { type: "string" },
        technologyManagement: { type: "string" },
      },
    },
    commercialSummary: {
      type: "object",
      required: ["quoteReference", "serviceLineItems"],
      properties: {
        quoteReference: { type: "string", description: "MUST reference the associated quote number - TBC if not mentioned" },
        serviceLineItems: {
          type: "array",
          description: "Rows for the Professional Services / Milestone pricing table. Label = resource type if time_and_materials, milestone name if milestone-based. Rate/quantity/total are plain numbers (no currency symbol/commas) so totals can be computed reliably.",
          items: {
            type: "object",
            required: ["label", "rate", "quantity", "total"],
            properties: {
              label: { type: "string" },
              rate: { type: "number" },
              quantity: { type: "number" },
              total: { type: "number" },
            },
          },
        },
        managedServiceUplift: {
          type: "object",
          description: "Omit entirely if not applicable",
          properties: {
            description: { type: "string" },
            total: { type: "number" },
          },
        },
        azureCostEstimate: {
          type: "array",
          description: "Omit/empty if no Azure consumption costs",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              each: { type: "number" },
              quantity: { type: "number" },
              monthly: { type: "number" },
              annual: { type: "number" },
            },
          },
        },
        ongoingAnnualCosts: {
          type: "array",
          description: "Omit/empty if no ongoing annual costs",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              each: { type: "number" },
              quantity: { type: "number" },
              annual: { type: "number" },
            },
          },
        },
      },
    },
  },
};

const SOW_SYSTEM_PROMPT = `You are drafting structured content for a Roc Technologies Statement of
Work / sales proposal, extracted from a sales or discovery call transcript,
or a free-text list of requirements.

Populate the fields of the extract_sow_data tool strictly according to
this policy:

- Only populate a field from what is actually stated or reasonably
  inferable from the input. Where information is missing, set the field to
  the literal string "TBC" rather than inventing or guessing content. For
  array fields, use an empty array rather than an array containing "TBC".
- Write all prose fields in UK English (e.g. "organise", "colour",
  "specialise"), using UK punctuation and spelling conventions.
- Do not use dashes (em dash or en dash) as a substitute for commas,
  parentheses, or full stops. Use plain commas, brackets, or separate
  sentences instead.
- Keep prose fields professional, concise, and written in the third
  person, as they would appear in a formal sales proposal document -
  not as quotes or a transcript excerpt.
- For rocServices.pricingBasis, infer "milestone" vs "time_and_materials"
  from context; default to "time_and_materials" if genuinely unclear.
- For any numeric field (rate, quantity, total, each, monthly, annual),
  give a plain number with no currency symbol or thousands separators. If
  no figure was mentioned, use 0 rather than guessing a price.
- Only include serviceOverview (and set include: true) if the transcript
  actually describes a Managed Service / ongoing support element. Omit it,
  or set include: false, for a pure project/delivery engagement.`;

module.exports = { SOW_SCHEMA, SOW_SYSTEM_PROMPT };
