# Data Fetcher

A Salesforce Flow Screen Component that enables reactive data retrieval directly within Screen Flows. Supports SOQL queries, SOSL searches, aggregate queries, and List View-based record retrieval via the Lightning UI API wire service.

## Features

- **SOQL Queries** — Execute dynamic SOQL queries with merge field support for Flow variables
- **SOSL Searches** — Perform full-text searches across one or two objects simultaneously
- **Aggregate Queries** — Run aggregate SOQL (COUNT, SUM, AVG, etc.) and return integer results
- **List View Records (Wire Service)** — Load records from existing List Views using `getListRecordsByName`, with automatic column detection and pagination support
- **Reactive** — Automatically re-fetches when input values change (configurable debounce for SOQL/SOSL)
- **Flow-Native** — Outputs strongly-typed SObject collections compatible with Flow's generic type system
- **Data Cloud Support** — Object picker includes Data Cloud objects (DMO, DLO)

## Installation

Deploy the source to your org using Salesforce CLI:

```bash
sf project deploy start --source-dir force-app
```

Or install via the managed package from AppExchange (Salesforce Labs).

## Usage

Add the **Data Fetcher** component to any Screen Flow element. The Custom Property Editor (CPE) provides a guided configuration experience in Flow Builder.

Every text or numeric configuration value can be entered as a literal or
selected from the Flow Config resource picker. Existing saved Flow references
and literal formats remain compatible when upgrading from earlier Data Fetcher
versions.

Object Name and Second Object Name use the Flow Config object picker, which
searches accessible queryable objects by label or API name and restores existing
saved API names. It shows normal user-facing objects by default; use the
root-level **Show all objects** switch for specialized or internal objects.

Picker validation uses the same metadata-driven type rules for visible choices,
pasted references, and restored values. Known incompatible resources or fields
show a contextual error with the selected name, actual type/cardinality, and
required input shape. For example, Page Size rejects a Text variable and asks
for a Number resource or numeric value. References whose metadata is not yet
available remain compatible until Flow Builder can resolve their type.
Numeric literals must be complete finite numbers; partially numeric text is not
silently truncated and instead receives the same inline guidance.

Picker popovers render their shell before deriving large metadata lists and
append results as they are scrolled. In Additional Fields, the selected-fields
heading provides an icon-only clear-all action; the popover closes through its
header, outside click, or Escape rather than a separate Done button.

### SOQL Mode

1. Select your target object
2. Enter a SOQL query string (supports Flow merge fields like `{!varName}`)
3. Access results via `retrievedRecords` (collection) and `firstRetrievedRecord` (single record) output variables

### List View Mode (Wire Service)

1. Check **"Use Wire Service (getListRecordsByName)"**
2. Select the target object
3. Enter the List View API Name (e.g., `AllAccounts`, `MyOpenOpportunities`)
4. Optionally configure:
   - **Additional Fields** — Multi-select fields from the selected object, or switch to a Flow value containing comma-separated field API names
   - **Page Size** — Records per page (1–2000, default 50)
   - **Sort By Field** — Select a field from the chosen object, or switch to a custom literal/Flow resource
   - **Page Token** — For pagination across multiple screens/loops
5. Results output to the same `retrievedRecords` and `firstRetrievedRecord` variables
6. Use the `nextPageToken` output to paginate through large result sets

### SOSL Mode

1. Check **"Show SOSL Configuration"**
2. Optionally select a second object
3. Enter a SOSL search string
4. Access results via `searchResults` and `searchResults1` output variables

### Aggregate Mode

1. Enter an aggregate SOQL query (e.g., `SELECT COUNT(Id) FROM Account`)
2. Access the result via `aggQueryResult` (Integer output)

## Component Architecture

| Component                      | Purpose                                                |
| ------------------------------ | ------------------------------------------------------ |
| `dataFetcher`                  | Main runtime component (invisible in Flow UI)          |
| `dataFetcherCPE`               | Custom Property Editor built on `flowConfigEditorBase` |
| `dataFetcherObjectPicker`      | Legacy object picker retained for compatibility        |
| `dataFetcherObjectPickerUtils` | Legacy standard-object option helpers                  |
| `flowConfig*`                  | Embedded resource, object, and field picker framework  |

### Apex Controllers

| Class                                | Purpose                                                |
| ------------------------------------ | ------------------------------------------------------ |
| `DataFetcherController`              | Executes SOQL, SOSL, and aggregate queries (USER_MODE) |
| `DataFetcherFieldSelectorController` | Retrieves object field metadata for the CPE            |
| `DataFetcherObjectPickerController`  | Retrieves objects, picklist values, and list views     |

## Configuration Properties

### Inputs

| Property          | Type    | Mode      | Description                                                                   |
| ----------------- | ------- | --------- | ----------------------------------------------------------------------------- |
| `queryString`     | String  | SOQL      | The SOQL query to execute                                                     |
| `searchString`    | String  | SOSL      | The SOSL search string                                                        |
| `aggQueryString`  | String  | Aggregate | The aggregate SOQL query                                                      |
| `objectName1`     | String  | All       | Primary object API name (default: Account)                                    |
| `objectName2`     | String  | SOSL      | Secondary object for SOSL                                                     |
| `debounceTime`    | String  | SOQL/SOSL | Debounce delay in ms (default: 300)                                           |
| `useWireService`  | Boolean | Wire      | Enable List View mode                                                         |
| `listViewApiName` | String  | Wire      | List View developer name                                                      |
| `fields`          | String  | Wire      | Additional fields (JSON list; legacy comma-separated values remain supported) |
| `fieldsIsCustom`  | Boolean | Wire      | Persisted field/resource input mode for Additional Fields                     |
| `pageSize`        | Integer | Wire      | Records per page (default: 50)                                                |
| `sortBy`          | String  | Wire      | Sort field or custom sort value                                               |
| `sortByIsCustom`  | Boolean | Wire      | Persisted field/custom input mode                                             |
| `pageToken`       | String  | Wire      | Pagination token                                                              |

### Outputs

| Property               | Type      | Description                      |
| ---------------------- | --------- | -------------------------------- |
| `retrievedRecords`     | SObject[] | Records from SOQL or List View   |
| `firstRetrievedRecord` | SObject   | First record from the result set |
| `error`                | String    | Error message if query fails     |
| `aggQueryResult`       | Integer   | Result from aggregate query      |
| `searchResults`        | SObject[] | SOSL results (first object)      |
| `searchResults1`       | SObject[] | SOSL results (second object)     |
| `nextPageToken`        | String    | Token for next page (Wire mode)  |

## Security

- All SOQL/SOSL queries execute in `USER_MODE`, enforcing Field-Level Security (FLS) and object CRUD permissions
- Wire service mode uses `optionalFields` to gracefully handle field-level access differences across profiles
- No data is exposed beyond what the running user has access to

## Development

### Prerequisites

- Salesforce CLI (`sf`)
- Node.js (for linting/testing)

### Setup

```bash
npm install
sf org create scratch -f config/project-scratch-def.json -a data-fetcher-dev
sf project deploy start --source-dir force-app -o data-fetcher-dev
sf org assign permset --name Flow_Config_Editor_Access -o data-fetcher-dev
```

### Run Tests

```bash
sf apex run test -o data-fetcher-dev --result-format human
```

## License

This project is licensed under the BSD 3-Clause License. See [LICENSE](LICENSE) for details.

Embedded third-party components retain their original licenses. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSES](LICENSES).
