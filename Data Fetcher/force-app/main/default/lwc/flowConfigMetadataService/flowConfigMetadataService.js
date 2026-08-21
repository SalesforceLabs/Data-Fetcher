import describeApexType from "@salesforce/apex/FlowConfigApexTypeController.describeType";
import describeHierarchySettings from "@salesforce/apex/FlowConfigApexTypeController.describeHierarchySettings";

const metadataRequests = new Map();

export function parseMetadataList(response, propertyName) {
  if (Array.isArray(response)) {
    return response;
  }
  if (typeof response === "string") {
    return parseMetadataList(JSON.parse(response), propertyName);
  }
  return Array.isArray(response?.[propertyName]) ? response[propertyName] : [];
}

/** Shares one metadata promise across every picker instance. */
export function loadSharedMetadata(key, loader) {
  if (!metadataRequests.has(key)) {
    let loaded;
    try {
      loaded = loader();
    } catch (error) {
      loaded = Promise.reject(error);
    }
    const request = Promise.resolve(loaded);
    metadataRequests.set(key, request);
    request.catch(() => {
      if (metadataRequests.get(key) === request) {
        metadataRequests.delete(key);
      }
    });
  }
  return metadataRequests.get(key);
}

export function loadApexMembers(apexClassName, fallbackLoader) {
  return loadSharedMetadata(`apex:${apexClassName}`, async () => {
    let members = [];
    try {
      members = parseMetadataList(
        await describeApexType({ apexClassName }),
        "members"
      );
    } catch {
      // Managed Apex source may be hidden; the Visualforce Tooling API bridge
      // is the supported fallback for that case.
    }
    return members.length
      ? members
      : parseMetadataList(await fallbackLoader(), "members");
  });
}

export function loadHierarchySettings() {
  return loadSharedMetadata("global:$Setup", () => describeHierarchySettings());
}

export function clearMetadataCache() {
  metadataRequests.clear();
}
