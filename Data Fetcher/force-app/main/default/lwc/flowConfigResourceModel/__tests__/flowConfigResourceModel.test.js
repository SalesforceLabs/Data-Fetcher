import {
  automaticOutputEntry,
  buildOutputItems,
  buildRecordBrowseStack,
  buildResourceCompatibilityError,
  buildResourceSearchText,
  compatibleResourceTypesForInput,
  findNestedResource,
  groupResourceOptions,
  normalizeAutomaticOutputMap,
  normalizeOutputType,
  searchNestedItems
} from "c/flowConfigResourceModel";

describe("flowConfigResourceModel", () => {
  it("builds contextual compatibility errors from resolved metadata", () => {
    expect(
      buildResourceCompatibilityError(
        {
          label: "Text Variable",
          dataType: "String",
          isCollection: false
        },
        {
          acceptedTypes: "Number",
          collection: "exclude",
          inputLabel: "Page Size",
          allowLiteral: true
        }
      )
    ).toBe(
      "“Text Variable” has type Text. Page Size requires a single Number value. Select a Number resource or enter a numeric value."
    );
    expect(
      buildResourceCompatibilityError(
        {
          label: "Amounts",
          dataType: "Number",
          isCollection: true
        },
        {
          acceptedTypes: "Number",
          collection: "exclude",
          inputLabel: "Page Size"
        }
      )
    ).toContain("has type Number collection");
    expect(
      buildResourceCompatibilityError(
        { label: "Amount", dataType: "Number" },
        { acceptedTypes: "Number", collection: "exclude" }
      )
    ).toBe("");
    expect(
      buildResourceCompatibilityError(
        { label: "Unknown field", dataType: "Field reference" },
        { acceptedTypes: "Number", collection: "exclude" }
      )
    ).toBe("");
  });

  it("normalizes output types without component state", () => {
    expect(normalizeOutputType("Currency")).toBe("Number");
    expect(normalizeOutputType("Record")).toBe("SObject");
    expect(normalizeOutputType("apex://PaymentResult")).toBe("Apex");
  });

  it("normalizes and resolves automatic output maps", () => {
    const outputMap = normalizeAutomaticOutputMap(
      JSON.stringify({ "Screen.DataFetcher": [{ name: "records" }] })
    );
    expect(automaticOutputEntry({ name: "DataFetcher" }, outputMap)).toEqual({
      found: true,
      outputs: [{ name: "records" }]
    });
  });

  it("searches nested outputs and retains their browse ancestors", () => {
    const items = [
      {
        label: "Fetcher",
        path: "Fetcher",
        isListContainer: true,
        items: [{ label: "Amount", reference: "{!Fetcher.amount}" }]
      }
    ];
    const [match] = searchNestedItems(items, "amount");
    expect(match.reference).toBe("{!Fetcher.amount}");
    expect(match.browseAncestors).toHaveLength(1);
  });

  it("groups resources in Flow category order", () => {
    const groups = groupResourceOptions({
      topLevelResources: [{ label: "Variable", category: "Simple Variables" }],
      automaticContainers: [],
      screenContainers: [{ label: "Screen" }],
      globalContainers: [{ label: "User" }]
    });
    expect(groups.map(([label]) => label)).toEqual([
      "Screen",
      "Simple Variables",
      "Global Variables"
    ]);
  });

  it("restores record browse stacks and nested descriptors", () => {
    expect(
      buildRecordBrowseStack(
        { label: "Opportunity", objectType: "Opportunity" },
        "varOpportunity.Account.Owner.Name",
        {
          labels: ["Account", "Owner", "Name"],
          objectTypes: ["Account", "User", null]
        }
      ).map((node) => node.objectType)
    ).toEqual(["Opportunity", "Account", "User"]);
    expect(
      findNestedResource(
        [{ label: "Result", items: [{ label: "Amount", reference: "x" }] }],
        "x"
      ).labels
    ).toEqual(["Result", "Amount"]);
  });

  it("builds typed, nested component outputs through one model", () => {
    const items = buildOutputItems({
      path: "DataFetcher",
      outputs: [
        { name: "amount", type: "Currency" },
        { name: "record", type: "{T}" }
      ],
      automaticOutputMap: {
        "DataFetcher.record": [{ name: "Name", type: "String" }]
      },
      allowRecordFields: true,
      resolveObjectType: () => "Account",
      isCompatible: () => true,
      iconForResource: ({ dataType }) => `icon:${dataType}`
    });

    expect(items[0]).toMatchObject({
      reference: "{!DataFetcher.amount}",
      dataType: "Number",
      iconName: "icon:Number"
    });
    expect(items[1]).toMatchObject({
      dataType: "SObject",
      objectType: "Account",
      isListContainer: true
    });
    expect(items[1].items[0].reference).toBe("{!DataFetcher.record.Name}");
  });

  it("centralizes input coercion and indexes nested metadata", () => {
    expect(compatibleResourceTypesForInput("String")).toBe(
      "String,Number,Boolean,Date,DateTime,Time"
    );
    expect(compatibleResourceTypesForInput("Number")).toBe("Number");
    expect(
      buildResourceSearchText({
        label: "Schedule Tool",
        outputs: [{ name: "recordCount", type: "Number" }]
      })
    ).toContain("recordcount");
  });
});
