import describeApexType from "@salesforce/apex/FlowConfigApexTypeController.describeType";
import describeHierarchySettings from "@salesforce/apex/FlowConfigApexTypeController.describeHierarchySettings";
import {
  clearMetadataCache,
  loadApexMembers,
  loadHierarchySettings,
  loadSharedMetadata
} from "c/flowConfigMetadataService";

jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeType",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeHierarchySettings",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);

describe("flowConfigMetadataService", () => {
  afterEach(() => {
    clearMetadataCache();
    jest.clearAllMocks();
  });

  it("deduplicates Apex metadata across picker instances", async () => {
    describeApexType.mockResolvedValueOnce(
      JSON.stringify([{ name: "amount", dataType: "Number" }])
    );
    const fallback = jest.fn();

    const first = loadApexMembers("PaymentResult", fallback);
    const second = loadApexMembers("PaymentResult", fallback);

    await expect(first).resolves.toHaveLength(1);
    await expect(second).resolves.toHaveLength(1);
    expect(describeApexType).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("uses the bridge fallback when Apex source metadata is unavailable", async () => {
    describeApexType.mockRejectedValueOnce(new Error("source hidden"));
    const fallback = jest.fn().mockResolvedValueOnce({
      members: [{ name: "result", dataType: "String" }]
    });

    await expect(loadApexMembers("ManagedResult", fallback)).resolves.toEqual([
      { name: "result", dataType: "String" }
    ]);
  });

  it("normalizes and caches hierarchy setting metadata", async () => {
    describeHierarchySettings.mockResolvedValueOnce(
      JSON.stringify([{ name: "Preferences__c", fields: [] }])
    );

    await expect(loadHierarchySettings()).resolves.toBe(
      JSON.stringify([{ name: "Preferences__c", fields: [] }])
    );
    await expect(loadHierarchySettings()).resolves.toBe(
      JSON.stringify([{ name: "Preferences__c", fields: [] }])
    );
    expect(describeHierarchySettings).toHaveBeenCalledTimes(1);
  });

  it("evicts a failed shared request", async () => {
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(["ready"]);
    await expect(loadSharedMetadata("flow:1", loader)).rejects.toThrow(
      "temporary"
    );
    await expect(loadSharedMetadata("flow:1", loader)).resolves.toEqual([
      "ready"
    ]);
  });
});
