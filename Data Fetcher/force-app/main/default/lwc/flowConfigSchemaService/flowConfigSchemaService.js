import describeSObjectPath from "@salesforce/apex/FlowConfigApexTypeController.describeSObjectPath";
import describeObjects from "@salesforce/apex/FlowConfigApexTypeController.describeObjects";

const recordPathRequests = new Map();
let objectRequest;

function parseDescriptor(response) {
  if (!response) {
    return null;
  }
  const descriptor =
    typeof response === "string" ? JSON.parse(response) : response;
  return descriptor?.dataType ? descriptor : null;
}

/**
 * Resolves one record field path and shares the in-flight/result promise across
 * every picker instance in the editor. Rejected requests are evicted so a
 * temporary metadata failure can be retried.
 */
export function describeRecordPath(objectApiName, fieldPath) {
  if (!objectApiName || !fieldPath) {
    return Promise.resolve(null);
  }
  const key = `${objectApiName}:${fieldPath}`;
  if (!recordPathRequests.has(key)) {
    const request = describeSObjectPath({ objectApiName, fieldPath })
      .then(parseDescriptor)
      .catch((error) => {
        recordPathRequests.delete(key);
        throw error;
      });
    recordPathRequests.set(key, request);
  }
  return recordPathRequests.get(key);
}

/** Test and explicit-refresh hook. */
export function clearRecordPathCache() {
  recordPathRequests.clear();
}

/** Shares accessible SObject discovery across every picker in one editor. */
export function listObjects() {
  if (!objectRequest) {
    objectRequest = describeObjects()
      .then((response) => {
        const objects =
          typeof response === "string" ? JSON.parse(response) : response;
        return Array.isArray(objects)
          ? objects.filter((item) => item?.apiName)
          : [];
      })
      .catch((error) => {
        objectRequest = null;
        throw error;
      });
  }
  return objectRequest;
}

/** Test and explicit-refresh hook. */
export function clearObjectCache() {
  objectRequest = null;
}
