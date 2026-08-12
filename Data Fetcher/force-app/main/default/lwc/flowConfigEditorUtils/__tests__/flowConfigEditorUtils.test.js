import {
  collectFlowResources,
  filterFlowResources,
  flowDataTypeForField,
  fromFlowReference,
  getInputValue,
  iconForFlowDataType,
  isFieldTypeAccepted,
  relationshipTargetsForField,
  toFlowReference
} from "c/flowConfigEditorUtils";

describe("flowConfigEditorUtils", () => {
  const builderContext = {
    variables: [
      { name: "SearchText", dataType: "String", isCollection: false },
      {
        name: "Accounts",
        dataType: "SObject",
        objectType: "Account",
        isCollection: true
      },
      {
        name: "ApexItems",
        dataType: "Apex",
        apexClass: "ExamplePayload",
        isCollection: true
      }
    ],
    formulas: [{ name: "FullName", dataType: "String" }],
    choices: [{ name: "YesChoice", dataType: "Boolean" }],
    textTemplates: [{ name: "WelcomeMessage" }],
    stages: [{ name: "Stage1", label: "Stage 1", stageOrder: 1 }],
    recordLookups: [
      { name: "Get_Contacts", object: "Contact", getFirstRecordOnly: false },
      { name: "Get_Account", object: "Account", getFirstRecordOnly: true }
    ],
    actionCalls: [
      {
        name: "Run_Action",
        outputParameters: [
          { name: "results", dataType: "String", isCollection: true }
        ]
      }
    ]
  };

  it("normalizes Flow references", () => {
    expect(toFlowReference("Accounts")).toBe("{!Accounts}");
    expect(toFlowReference("{!Accounts}")).toBe("{!Accounts}");
    expect(fromFlowReference("{!Get_Account.Name}")).toBe("Get_Account.Name");
    expect(toFlowReference("")).toBeNull();
  });

  it("uses one Flow icon mapping for UI API field types", () => {
    const iconForField = (sourceDataType) =>
      iconForFlowDataType({
        dataType: flowDataTypeForField(sourceDataType),
        sourceDataType
      });

    expect(iconForField("Address")).toBe("utility:text");
    expect(iconForField("String")).toBe("utility:text");
    expect(iconForField("Double")).toBe("utility:number_input");
    expect(iconForField("Currency")).toBe("utility:currency");
    expect(iconForField("Picklist")).toBe("utility:picklist_type");
  });

  it("normalizes UI API numeric types before applying accepted Flow types", () => {
    expect(isFieldTypeAccepted("Currency", "Number")).toBe(true);
    expect(isFieldTypeAccepted("Double", "Number")).toBe(true);
    expect(isFieldTypeAccepted("Percent", "Number")).toBe(true);
    expect(isFieldTypeAccepted("String", "Number")).toBe(false);
  });

  it("preserves every target of a polymorphic relationship", () => {
    expect(
      relationshipTargetsForField({
        relationshipName: "Who",
        referenceToInfos: [
          { apiName: "Contact", label: "Contact" },
          { apiName: "Lead", label: "Lead" }
        ]
      })
    ).toEqual([
      { objectApiName: "Contact", objectLabel: "Contact" },
      { objectApiName: "Lead", objectLabel: "Lead" }
    ]);
  });

  it("collects named resources and automatic element outputs", () => {
    const resources = collectFlowResources(builderContext);
    expect(resources.map((resource) => resource.reference)).toEqual(
      expect.arrayContaining([
        "{!Accounts}",
        "{!SearchText}",
        "{!FullName}",
        "{!Get_Contacts}",
        "{!Get_Account}",
        "{!Run_Action.results}",
        "{!YesChoice}",
        "{!WelcomeMessage}",
        "{!Stage1}",
        "{!$Flow.CurrentDate}",
        "{!$GlobalConstant.EmptyString}",
        "{!$User}"
      ])
    );
    expect(
      resources.find((resource) => resource.reference === "{!Get_Contacts}")
    ).toMatchObject({
      dataType: "SObject",
      objectType: "Contact",
      isCollection: true,
      source: "Get Records"
    });
    expect(
      resources.find((resource) => resource.reference === "{!Accounts}")
    ).toMatchObject({ category: "Record Variables" });
    expect(
      resources.find((resource) => resource.reference === "{!SearchText}")
    ).toMatchObject({ category: "Simple Variables" });
    expect(
      resources.find((resource) => resource.reference === "{!ApexItems}")
    ).toMatchObject({
      category: "Apex-Defined Variables",
      dataType: "Apex",
      apexClass: "ExamplePayload",
      isCollection: true
    });
    expect(
      resources.find((resource) => resource.reference === "{!Stage1}")
    ).toMatchObject({
      category: "Stages",
      dataType: "String",
      source: "Stage"
    });
  });

  it("filters by type, collection shape, and search text", () => {
    const result = filterFlowResources(collectFlowResources(builderContext), {
      dataTypes: "SObject",
      collection: "only",
      query: "contact"
    });
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe("{!Get_Contacts}");

    const apexCollections = filterFlowResources(
      collectFlowResources(builderContext),
      {
        dataTypes: "Apex",
        collection: "only"
      }
    );
    expect(apexCollections.map((resource) => resource.reference)).toEqual([
      "{!ApexItems}"
    ]);
  });

  it("hydrates reference values from inputVariables", () => {
    const variables = [
      { name: "records", value: "Accounts", valueDataType: "reference" }
    ];
    expect(getInputValue(variables, "records")).toBe("{!Accounts}");
    expect(getInputValue(variables, "missing", "fallback")).toBe("fallback");
  });
});
