import { planCollectionChange } from "c/flowConfigGenericTypeCoordinator";

describe("flowConfigGenericTypeCoordinator", () => {
  it("clears dependent fields when the resolved type changes", () => {
    expect(
      planCollectionChange({
        newValue: "{!Accounts}",
        objectType: "Account",
        currentObjectType: "Contact",
        dependentValue: "Name"
      })
    ).toEqual({
      changed: true,
      nextObjectType: "Account",
      clearDependent: true,
      showResetNotice: true
    });
  });

  it("invalidates stale type state for unresolved pasted references", () => {
    expect(
      planCollectionChange({
        newValue: "{!Unknown}",
        objectType: null,
        currentObjectType: "Contact",
        dependentValue: "Name"
      })
    ).toMatchObject({ nextObjectType: null, clearDependent: true });
  });

  it("does nothing when the collection type is unchanged", () => {
    expect(
      planCollectionChange({
        newValue: "{!Contacts}",
        objectType: "Contact",
        currentObjectType: "Contact"
      }).changed
    ).toBe(false);
  });
});
