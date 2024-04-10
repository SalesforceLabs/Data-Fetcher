/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 01-02-2024
 * @last modified by  : Josh Dayment
**/
import { LightningElement, api, wire, track } from 'lwc';

const DATA_TYPE = {
    STRING: 'String',
    BOOLEAN: 'Boolean',
    NUMBER: 'Number',
    INTEGER: 'Integer'
};

const defaults = {
    inputAttributePrefix: 'select_',
};

const FLOW_EVENT_TYPE = {
    DELETE: 'configuration_editor_input_value_deleted',
    CHANGE: 'configuration_editor_input_value_changed'
}

const VALIDATEABLE_INPUTS = ['joshdaymentlabs-data-fetcher-c-p-e-combobox', 'joshdaymentlabs-data-fetcher-object-picker'];

export default class dataFectcherCPE extends LightningElement {
    @api automaticOutputVariables;
    typeValue;
    _builderContext = {};
    _values = [];
    _flowVariables = [];
    _typeMappings = [];
    rendered;
    @track isChecked = true;

    @track inputValues = {
        objectName1: { value: null, valueDataType: null, isCollection: false, label: 'Object Name' },
        objectName2: { value: 'Account', valueDataType: null, isCollection: false, label: 'Second Object Name' },
        queryString: { value: null, valueDataType: null, isCollection: false, label: 'SOQL Query String' },
        searchString: { value: null, valueDataType: null, isCollection: false, label: 'SOSL Query String' },
        aggQueryString: { value: null, valueDataType: null, isCollection: false, label: 'Aggregate Query String' },
    };

    @api get builderContext() {
        return this._builderContext;
    }

    set builderContext(value) {
        this._builderContext = value;
    }

    @api get inputVariables() {
        return this._values;
    }

    set inputVariables(value) {
        this._values = value;
        this.initializeValues();
    }

    @api get genericTypeMappings() {
        return this._genericTypeMappings;
    }
    set genericTypeMappings(value) {
        this._typeMappings = value;
        this.initializeTypeMappings();
    }

    @api
    validate() {
        let validity = [];
        for (let inputType of VALIDATEABLE_INPUTS) {
            for (let input of this.template.querySelectorAll(inputType)) {
                if (!input.reportValidity()) {
                    validity.push({
                        key: input.name || ('Error_' + validity.length),
                        errorString: 'This field has an error (missing or invalid entry)',
                    });
                }
            }
        }
        return validity;
    }   


    /* LIFECYCLE HOOKS */
    connectedCallback() {

    }

    renderedCallback() {
        if (!this.rendered) {
            this.rendered = true;
            for (let flowCombobox of this.template.querySelectorAll('joshdaymentlabs-data_fetcher_c_p_e_combobox')) {
                flowCombobox.builderContext = this.builderContext;
                flowCombobox.automaticOutputVariables = this.automaticOutputVariables;
            }             
        }
                
    }

    /* ACTION FUNCTIONS */
    initializeValues(value) {
        if (this._values && this._values.length) {
            this._values.forEach(curInputParam => {
                if (curInputParam.name && this.inputValues[curInputParam.name]) {
                    console.log('in initializeValues: ' + curInputParam.name + ' = ' + curInputParam.value);
                    // console.log('in initializeValues: '+ JSON.stringify(curInputParam));
                    if (this.inputValues[curInputParam.name].serialized) {
                        this.inputValues[curInputParam.name].value = JSON.parse(curInputParam.value);
                    } else {
                        this.inputValues[curInputParam.name].value = curInputParam.value;
                    }
                    this.inputValues[curInputParam.name].valueDataType = curInputParam.valueDataType;
                }
            });
        }
    }

    initializeTypeMappings() {
        this._typeMappings.forEach((typeMapping) => {
            // console.log(JSON.stringify(typeMapping));
            if (typeMapping.name && typeMapping.value) {
                this.typeValue = typeMapping.value;
            }
        });
    }

    /* EVENT HANDLERS */

    handleObjectChange(event) {
        if (event.target && event.detail) {
            // console.log('handling a dynamic type mapping');
            // console.log('event is ' + JSON.stringify(event));
            let typeValue = event.detail.objectType;
            const typeName = 'T';
            const dynamicTypeMapping = new CustomEvent('configuration_editor_generic_type_mapping_changed', {
                composed: true,
                cancelable: false,
                bubbles: true,
                detail: {
                    typeName,
                    typeValue,
                }
            });
            this.dispatchEvent(dynamicTypeMapping);
            if (this.inputValues.objectName1.value != typeValue) {
                this.inputValues.objectName1.value = typeValue;
                this.dispatchFlowValueChangeEvent(event.currentTarget.name, typeValue, 'String');
            }

            // this.dispatchFlowValueChangeEvent(event.currentTarget.name, event.detail.objectType, DATA_TYPE.STRING);
        }
    }

    handleSecondObjectChange(event) {
        if (event.target && event.detail) {
            // console.log('handling a dynamic type mapping');
            // console.log('event is ' + JSON.stringify(event));
            let typeValue = event.detail.objectType;
            const typeName = 'S';
            const dynamicTypeMapping = new CustomEvent('configuration_editor_generic_type_mapping_changed', {
                composed: true,
                cancelable: false,
                bubbles: true,
                detail: {
                    typeName,
                    typeValue,
                }
            });
            this.dispatchEvent(dynamicTypeMapping);
            if (this.inputValues.objectName2.value != typeValue) {
                this.inputValues.objectName2.value = typeValue;
                this.dispatchFlowValueChangeEvent(event.currentTarget.name, typeValue, 'String');
            }

            // this.dispatchFlowValueChangeEvent(event.currentTarget.name, event.detail.objectType, DATA_TYPE.STRING);
        }
    }

    handleFlowComboboxValueChange(event) {
        if (event.target && event.detail) {
            this.dispatchFlowValueChangeEvent(event.target.name, event.detail.newValue, event.detail.newValueDataType);
        }
    }

    handleValueChange(event) {
        if (event.detail && event.currentTarget.name) {
            let dataType = DATA_TYPE.STRING;
            if (event.currentTarget.type == 'checkbox') dataType = DATA_TYPE.BOOLEAN;
            if (event.currentTarget.type == 'number') dataType = DATA_TYPE.NUMBER;
            if (event.currentTarget.type == 'integer') dataType = DATA_TYPE.INTEGER;

            let newValue = event.currentTarget.type === 'checkbox' ? event.currentTarget.checked : event.detail.value;
            this.dispatchFlowValueChangeEvent(event.currentTarget.name, newValue, dataType);
        }
    }   

    updateRecordVariablesComboboxOptions(objectType) {
        const variables = this._flowVariables.filter(
            (variable) => variable.objectType === objectType
        );
        let comboboxOptions = [];
        variables.forEach((variable) => {
            comboboxOptions.push({
                label: variable.name,
                value: "{!" + variable.name + "}"
            });
        });
        return comboboxOptions;
    }

    dispatchFlowValueChangeEvent(id, newValue, dataType = DATA_TYPE.STRING) {
        //console.log('in dispatchFlowValueChangeEvent: ' + id, newValue, dataType);
        if (this.inputValues[id] && this.inputValues[id].serialized) {
            console.log('serializing value');
            newValue = JSON.stringify(newValue);
        }
        const valueChangedEvent = new CustomEvent(FLOW_EVENT_TYPE.CHANGE, {
            bubbles: true,
            cancelable: false,
            composed: true,
            detail: {
                name: id,
                newValue: newValue ? newValue : null,
                newValueDataType: dataType
            }
        });
        this.dispatchEvent(valueChangedEvent);
    }

    /* UTILITY FUNCTIONS */
    transformConstantObject(constant) {
        return {
            list: constant,
            get options() { return Object.values(this.list); },
            get default() { return this.options.find(option => option.default); },
            findFromValue: function (value) {
                let entry = this.options.find(option => option.value == value);
                return entry || this.default;
            },
            findFromLabel: function (label) {
                let entry = this.options.find(option => option.label == label);
                return entry || this.default;
            }
        }
    }

    handleCheckboxChange(event) {
        this.isChecked = event.target.checked;
      }

}