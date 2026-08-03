/**
 * @description       : Controller class for Data Fetcher object picker component.
 *                      Provides methods to retrieve Salesforce objects, picklist values, and list views.
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 8-3-2026
 * @last modified by  : Josh Dayment
**/
public with sharing class DataFetcherObjectPickerController { 
    
    /**
     * @description Retrieves a filtered list of Salesforce objects based on the provided object types.
     *              Includes custom objects, allowed standard objects, Data Cloud objects (including DMO and DLO), and optionally all objects.
     * @param availableObjectTypes List of object API names to filter by. If first element is 'all', returns all available objects.
     * @return List<Member> Sorted list of Member objects containing object API names and labels
     */
    @AuraEnabled(cacheable=true)
    public static List<Member> getObjects(List<String> availableObjectTypes) {
        List<Member> result = new List<Member>();
        // Get all SObject types available in the org
        Map<String, SObjectType> allTypes = Schema.getGlobalDescribe();

        // Flag to determine if we should display all objects regardless of filters
        Boolean isDisplayAll = false;
        
        // Check if the first element in the list is 'all' to display all objects
        try {
            if (availableObjectTypes[0]?.toLowerCase() == 'all') {
                // Clear the list and set flag to include all objects
                availableObjectTypes.clear();
                isDisplayAll = true;
            }
        } catch (Exception e) {   
            // Silently handle exceptions (e.g., empty list, null pointer)
        }

        // If no specific object types provided, use all available object types
        if (availableObjectTypes == null || availableObjectTypes.size() == 0) {
            availableObjectTypes = new List<String>(allTypes.keySet());
        }

        // Iterate through each object type and apply filtering logic
        for (String objType : availableObjectTypes) {
            Schema.DescribeSObjectResult describeObject = allTypes.get(objType).getDescribe();
            String objectType = describeObject.getName();
            String objectLabel = describeObject.getLabel();
            Boolean isCustom = describeObject.isCustom();
            
            // Check if object is a Data Cloud object
            Boolean isDataCloudObject = isDataCloudObject(describeObject);
            
            // Include object if it meets any of these criteria:
            // 1. It's a custom object
            // 2. It's in the allowed standard objects map
            // 3. It's a Data Cloud object (including DMO and DLO objects)
            // 4. Display all flag is set
            if (isCustom || allowedStandardObjects.containsKey(objectType) || isDataCloudObject || isDisplayAll) {
                // Exclude objects with labels starting with '__' (typically system/internal objects)
                // but allow Data Cloud objects even if they start with '__'
                Boolean isValidLabel = (String.isNotBlank(objectLabel) && objectLabel.length() >= 2 && objectLabel.substring(0,2) != '__');
                if (isValidLabel || isDataCloudObject) {
                    result.add(new Member(objectType, objectLabel));
                }
            }
        }
        
        // Sort the results alphabetically by label
        result.sort(); 
        
        return result;
    }
    
    /**
     * @description Determines if an object is a Data Cloud object based on its namespace and naming patterns.
     *              Includes Data Cloud objects, Data Model Object (DMO) objects, and Data Lake Object (DLO) objects.
     *              DLO objects typically end with '__dll' (e.g., Account_Home__dll).
     *              DMO objects typically end with '__dlm' (e.g., ssot__Account__dlm).
     *              Data Cloud objects typically have namespaces like 'DataCloud'.
     * @param describeObject The DescribeSObjectResult to check
     * @return Boolean True if the object is a Data Cloud, DMO, or DLO object, false otherwise
     */
    private static Boolean isDataCloudObject(Schema.DescribeSObjectResult describeObject) {
        try {
            String objectName = describeObject.getName();
            
            // Check if object ends with '__dll' (Data Lake Object pattern, e.g., Account_Home__dll)
            if (objectName.endsWithIgnoreCase('__dll')) {
                return true;
            }
            
            // Check if object ends with '__dlm' (Data Model Object pattern, e.g., ssot__Account__dlm)
            if (objectName.endsWithIgnoreCase('__dlm')) {
                return true;
            }
            
            // Extract namespace if object has namespace prefix (format: Namespace__ObjectName__c)
            String namespace = objectName.contains('__') 
                ? objectName.substringBefore('__') 
                : '';
            
            // Check if object has DataCloud namespace
            if (namespace.equalsIgnoreCase('DataCloud')) {
                return true;
            }
            
            // Check if object has DMO (Data Model Object) namespace
            if (namespace.equalsIgnoreCase('DMO')) {
                return true;
            }
            
            // Check if object has DLO (Data Lake Object) namespace
            if (namespace.equalsIgnoreCase('DLO')) {
                return true;
            }
            
            // Check if object name contains DataCloud (for objects like DataCloud__DataModelName__c)
            if (objectName.containsIgnoreCase('DataCloud')) {
                return true;
            }
            
            // Check if object name contains DMO (for Data Model Object objects)
            if (objectName.containsIgnoreCase('DMO')) {
                return true;
            }
            
            // Check if object name contains DLO (for Data Lake Object objects)
            if (objectName.containsIgnoreCase('DLO')) {
                return true;
            }
        } catch (Exception e) {
            // If any error occurs during detection, assume it's not a Data Cloud object
            return false;
        }
        
        return false;
    }
    /**
     * @description Retrieves all picklist values for a specific field on a given object.
     *              Used to populate dropdown/combobox options in the UI.
     * @param objectApiName The API name of the object containing the picklist field
     * @param fieldName The API name of the picklist field
     * @return List<Member> Sorted list of Member objects containing picklist values, labels, active status, and default value flags
     */
    @AuraEnabled(cacheable=true)
    public static List<Member> getPicklistValues(String objectApiName, String fieldName) {
        List<Member> options = new List<Member>();
        
        // Get the object's describe information
        Schema.DescribeSObjectResult describeObject = Schema.getGlobalDescribe().get(objectApiName).getDescribe();
        
        // Get all fields for the object
        Map<String, Schema.SObjectField> fieldMap = describeObject.fields.getMap();
        
        // Get picklist values for the specified field
        List<Schema.PicklistEntry> values = fieldMap.get(fieldName).getDescribe().getPickListValues();

        // Convert each picklist entry to a Member object
        for (Schema.PicklistEntry a : values) {
            options.add(new Member(a.getValue(), a.getLabel(), a.isActive(), a.isDefaultValue()));
        }
        
        // Sort the options alphabetically by label
        options.sort();

        return options;
    }

    /**
     * @description Retrieves all SOQL-compatible list views for a given object.
     *              List views are used to filter and display records in Salesforce.
     * @param objectApiName The API name of the object to retrieve list views for
     * @return List<Member> Sorted list of Member objects containing list view developer names and display names
     */
    @AuraEnabled(cacheable=true)
    public static List<Member> getListViews(String objectApiName) {
        List<Member> listViews = new List<Member>();
        
        try {
            // Query for list views that are SOQL-compatible (can be used in queries)
            List<ListView> views = [SELECT Id, Name, DeveloperName, SobjectType 
                                   FROM ListView 
                                   WHERE SobjectType = :objectApiName 
                                   AND IsSoqlCompatible = true];
            
            // Convert each list view to a Member object
            for (ListView view : views) {
                listViews.add(new Member(view.DeveloperName, view.Name));
            }
            
            // Sort the list views alphabetically by name
            listViews.sort();
        } catch (Exception e) {
            // Log error but return empty list to prevent UI failures
            System.debug('Error fetching list views: ' + e.getMessage());
        }
        
        return listViews;
    }

    /**
     * @description Inner class representing a selectable member/item in dropdowns and pickers.
     *              Used to represent objects, picklist values, and list views with their labels and values.
     *              Implements Comparable interface for sorting capabilities.
     */
    @JsonAccess(serializable='always' deserializable='always')
    public class Member implements Comparable {

        @AuraEnabled
        public String label;  // Display label shown to users
        @AuraEnabled
        public String value;  // API value used in queries and code
        @AuraEnabled
        public Boolean isActive;  // For picklist values: indicates if the value is currently active
        @AuraEnabled
        public Boolean isDefaultValue;  // For picklist values: indicates if this is the default value

        /**
         * @description Constructor for Member objects used for objects and list views.
         * @param value The API name/value of the member
         * @param label The display label of the member
         */
        public Member(String value, String label) {
            this.label = label;
            this.value = value;
        }

        /**
         * @description Constructor for Member objects used for picklist values.
         * @param value The API value of the picklist entry
         * @param label The display label of the picklist entry
         * @param isActive Whether the picklist value is currently active
         * @param isDefaultValue Whether this is the default picklist value
         */
        public Member(String value, String label, Boolean isActive, Boolean isDefaultValue) {
            this.value = value;
            this.label = label;         
            this.isActive = isActive;
            this.isDefaultValue = isDefaultValue;
        }

        /**
         * @description Compares this Member to another Member for sorting purposes.
         *              Comparison is based on the label field (case-sensitive string comparison).
         * @param compareTo The Member object to compare against
         * @return Integer 0 if labels are equal, 1 if this label is greater, -1 if this label is less
         */
        public Integer compareTo(Object compareTo) {
            Member curMember = (Member) compareTo;

            if (label == curMember.label) {
                return 0;
            }
            if (label > curMember.label) {
                return 1;
            }
            return -1;
        }
    }

    /**
     * @description Map of allowed standard Salesforce objects that can be selected in the object picker.
     *              Only standard objects listed here will be included unless 'all' is specified or the object is custom.
     *              Key: Object API name, Value: Object display label (currently same as API name for most entries)
     */
    private static Map<String, String> allowedStandardObjects = new Map<String, String>{
            'Account' => 'Account',
            'AccountPartner' => 'Account Partner',
            'Asset' => 'Asset',
            'AssetRelationship' => 'Asset Relationship',
            'AssignedResource' => 'Assigned Resource',
            'Campaign' => 'Campaign',
            'CampaignMember' => 'Campaign Member',
            'Case' => 'Case',
            'Contact' => 'Contact',
            'ContactRequest' => 'Contact Request',
            'ContentDocument' => 'File',
            'ContentVersion' => 'File',
            'ContentWorkspace' => 'Library',
            'Contract' => 'Contract',
            'ContractContactRole' => 'Contract Contact Role',
            'Image' => 'Image',
            'Individual' => 'Individual',
            'Lead' => 'Lead',
            'MaintenanceAsset' => 'Maintenance Asset',
            'MaintenancePlan' => 'Maintenance Plan',
            'Note' => 'Note',
            'OperatingHours' => 'Operating Hours',
            'Opportunity' => 'Opportunity',
            'OpportunityLineItem' => 'Opportunity Product',
            'OpportunityPartner' => 'Opportunity Partner',
            'Order' => 'Order',
            'OrderItem' => 'Order Product',
            'Partner' => 'Partner',
            'Pricebook2' => 'Price Book',
            'PricebookEntry' => 'Price Book Entry',
            'Product2' => 'Product',
            'RecordType' => 'Record Type',
            'ResourceAbsence' => 'Resource Absence',
            'ResourcePreference' => 'Resource Preference',
            'ReturnOrder' => 'Return Order',
            'ReturnOrderLineItem' => 'Return Order Line Item',
            'ServiceAppointment' => 'Service Appointment',
            'ServiceCrew' => 'Service Crew',
            'ServiceCrewMember' => 'Service Crew Member',
            'ServiceResource' => 'Service Resource',
            'ServiceResourceCapacity' => 'Resource Capacity',
            'ServiceResourceSkill' => 'Service Resource Skill',
            'ServiceTerritory' => 'Service Territory',
            'ServiceTerritoryLocation' => 'Service Territory Location',
            'ServiceTerritoryMember' => 'Service Territory Member',
            'Shift' => 'Shift',
            'Shipment' => 'Shipment',
            'SkillRequirement' => 'Skill Requirement',
            'TimeSheet' => 'Time Sheet',
            'TimeSheetEntry' => 'Time Sheet Entry',
            'TimeSlot' => 'Time Slot',
            'User' => 'User',
            'WorkOrder' => 'Work Order',
            'WorkOrderLineItem' => 'Work Order Line Item',
            'WorkType' => 'Work Type',
            'Quote' => 'Quote',
            'QuoteLineItem' => 'Quote Line Item',
            'FlowOrchestrationInstance' => 'Flow Orchestration Instance',
            'FlowOrchestrationStageInstance' => 'Flow Orchestration Stage Instance',
            'FlowOrchestrationStepInstance' => 'Flow Orchestration Step Instance'
    };
}