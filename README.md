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

### SOQL Mode

1. Select your target object
2. Enter a SOQL query string (supports Flow merge fields like `{!varName}`)
3. Access results via `retrievedRecords` (collection) and `firstRetrievedRecord` (single record) output variables

### List View Mode (Wire Service)

1. Check **"Use Wire Service (getListRecordsByName)"**
2. Select the target object
3. Enter the List View API Name (e.g., `AllAccounts`, `MyOpenOpportunities`)
4. Optionally configure:
   - **Additional Fields** — Extra fields beyond the list view's columns
   - **Page Size** — Records per page (1–2000, default 50)
   - **Sort By** — Override the list view's default sort
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

| Component | Purpose |
|-----------|---------|
| `dataFetcher` | Main runtime component (invisible in Flow UI) |
| `dataFetcherCPE` | Custom Property Editor for Flow Builder configuration |
| `dataFetcherCPECombobox` | Flow-aware combobox supporting merge field selection |
| `dataFetcherCPEComboboxUtils` | Utility functions for combobox navigation |
| `dataFetcherObjectPicker` | Object selection component with search |
| `dataFetcherObjectPickerUtils` | Standard object options list |

### Apex Controllers

| Class | Purpose |
|-------|---------|
| `DataFetcherController` | Executes SOQL, SOSL, and aggregate queries (USER_MODE) |
| `DataFetcherFieldSelectorController` | Retrieves object field metadata for the CPE |
| `DataFetcherObjectPickerController` | Retrieves objects, picklist values, and list views |

## Configuration Properties

### Inputs

| Property | Type | Mode | Description |
|----------|------|------|-------------|
| `queryString` | String | SOQL | The SOQL query to execute |
| `searchString` | String | SOSL | The SOSL search string |
| `aggQueryString` | String | Aggregate | The aggregate SOQL query |
| `objectName1` | String | All | Primary object API name (default: Account) |
| `objectName2` | String | SOSL | Secondary object for SOSL |
| `debounceTime` | String | SOQL/SOSL | Debounce delay in ms (default: 300) |
| `useWireService` | Boolean | Wire | Enable List View mode |
| `listViewApiName` | String | Wire | List View developer name |
| `fields` | String | Wire | Additional fields (comma-separated, optional) |
| `pageSize` | Integer | Wire | Records per page (default: 50) |
| `sortBy` | String | Wire | Sort override field(s) |
| `pageToken` | String | Wire | Pagination token |

### Outputs

| Property | Type | Description |
|----------|------|-------------|
| `retrievedRecords` | SObject[] | Records from SOQL or List View |
| `firstRetrievedRecord` | SObject | First record from the result set |
| `error` | String | Error message if query fails |
| `aggQueryResult` | Integer | Result from aggregate query |
| `searchResults` | SObject[] | SOSL results (first object) |
| `searchResults1` | SObject[] | SOSL results (second object) |
| `nextPageToken` | String | Token for next page (Wire mode) |

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
```

### Run Tests

```bash
sf apex run test -o data-fetcher-dev --result-format human
```

## License

This project is licensed under the BSD 3-Clause License. See [LICENSE](LICENSE) for details.
