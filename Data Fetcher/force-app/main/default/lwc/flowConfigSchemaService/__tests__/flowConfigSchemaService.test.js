import describeSObjectPath from "@salesforce/apex/FlowConfigApexTypeController.describeSObjectPath";
import describeObjects from "@salesforce/apex/FlowConfigApexTypeController.describeObjects";
import {
  clearObjectCache,
  clearRecordPathCache,
  describeRecordPath,
  listObjects
} from "c/flowConfigSchemaService";

jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeSObjectPath",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeObjects",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);

describe("flowConfigSchemaService", () => {
  afterEach(() => {
    clearRecordPathCache();
    clearObjectCache();
    jest.clearAllMocks();
  });

  it("shares one normalized request across picker consumers", async () => {
    describeSObjectPath.mockResolvedValueOnce(
      JSON.stringify({
        name: "Name",
        dataType: "String",
        sourceDataType: "String"
      })
    );

    const first = describeRecordPath("Account", "Owner.Name");
    const second = describeRecordPath("Account", "Owner.Name");

    await expect(first).resolves.toMatchObject({ name: "Name" });
    await expect(second).resolves.toMatchObject({ dataType: "String" });
    expect(describeSObjectPath).toHaveBeenCalledTimes(1);
  });

  it("evicts failed requests so metadata can be retried", async () => {
    describeSObjectPath
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(
        JSON.stringify({ name: "Name", dataType: "String" })
      );

    await expect(describeRecordPath("Contact", "Name")).rejects.toThrow(
      "temporary failure"
    );
    await expect(describeRecordPath("Contact", "Name")).resolves.toMatchObject({
      name: "Name"
    });
    expect(describeSObjectPath).toHaveBeenCalledTimes(2);
  });

  it("shares and normalizes object discovery", async () => {
    describeObjects.mockResolvedValueOnce(
      JSON.stringify([{ apiName: "Account", label: "Account" }, null])
    );

    const first = listObjects();
    const second = listObjects();

    await expect(first).resolves.toEqual([
      { apiName: "Account", label: "Account" }
    ]);
    await expect(second).resolves.toHaveLength(1);
    expect(describeObjects).toHaveBeenCalledTimes(1);
  });

  it("allows object discovery to retry after failure", async () => {
    describeObjects
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce([{ apiName: "Contact" }]);

    await expect(listObjects()).rejects.toThrow("temporary failure");
    await expect(listObjects()).resolves.toEqual([{ apiName: "Contact" }]);
  });
});
