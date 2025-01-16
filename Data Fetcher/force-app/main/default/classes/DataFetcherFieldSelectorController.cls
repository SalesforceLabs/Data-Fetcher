/**
 * @name: DataFetcherFieldSelectorController
 * @description: This class provides a method to fetch fields for a given object name. It returns a list of Field objects, representing the fields of the specified object.
 * @author: Josh Dayment
 * @last modified on: 1-14-2025
 * @last modified by: Josh Dayment
 */
public with sharing class DataFetcherFieldSelectorController {
    /**
     * @name: getObjectFields
     * @description: Retrieves the fields of a specified Salesforce object.
     * @param objectName The name of the Salesforce object to retrieve fields from.
     * @return A list of Field objects representing the fields of the specified object.
     */
    @AuraEnabled(cacheable=true)
    public static List<Field> getObjectFields(String objectName) {
        List<Field> fields = new List<Field>();
        Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();

        if (globalDescribe.containsKey(objectName)) {
            Schema.DescribeSObjectResult objectDescribe = globalDescribe.get(objectName).getDescribe();
            Map<String, Schema.SObjectField> objectFields = objectDescribe.fields.getMap();

            for (String fieldName : objectFields.keySet()) {
                Schema.SObjectField field = objectFields.get(fieldName);
                Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
                Field f = new Field(fieldDescribe.getName(), fieldDescribe.getLabel(), String.valueOf(fieldDescribe.getType()));
                fields.add(f);
            }
        }

        return fields;
    }

    public class Response {
        public String errorMessage;
        public List<Field> fields;
    }

    /**
     * Inner class representing a field of a Salesforce object.
     */
    public class Field {
        /**
         * @name: name
         * @description: The name of the field.
         */
        @AuraEnabled
        public String name;

        /**
         * @name: label
         * @description: The label of the field.
         */
        @AuraEnabled
        public String label;

        /**
         * @name: type
         * @description: The data type of the field.
         */
        @AuraEnabled
        public String type;

        @AuraEnabled public String parentObjectName;    // Used for lookup fields
        @AuraEnabled public String relationshipName;    // Used for lookup fields

        /**
         * Constructor for Field.
         * @param name The name of the field.
         * @param label The label of the field.
         * @param type The data type of the field.
         */
        public Field(String name, String label, String type) {
            this.name = name;
            this.label = label;
            this.type = type;
        }
    }
}
