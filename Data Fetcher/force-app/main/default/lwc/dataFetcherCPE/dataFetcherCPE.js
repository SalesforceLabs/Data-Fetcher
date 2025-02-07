import { LightningElement, api, track } from 'lwc';

const DATA_TYPE = {
    STRING: 'String',
    BOOLEAN: 'Boolean',
    NUMBER: 'Number',
    INTEGER: 'Integer'
};

const FLOW_EVENT_TYPE = {
    DELETE: 'configuration_editor_input_value_deleted',
    CHANGE: 'configuration_editor_input_value_changed'
}

export default class dataFetcherCPE extends LightningElement {
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
        debounceTime: {value: '300', valueDataType: null, isCollection: false, label: 'Debounce Time'},
        
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


    /* LIFECYCLE HOOKS */
   
        

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
            
            if (typeMapping.name && typeMapping.value) {
                this.typeValue = typeMapping.value;
            }
        });
    }

    /* EVENT HANDLERS */

    handleObjectChange(event) {
        if (event.target && event.detail) {
            
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

            
        }
    }

    handleSecondObjectChange(event) {
        if (event.target && event.detail) {
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

            
        }
    }

    handleFlowComboboxValueChange(event) {
        if (event.target && event.detail) {
            this.dispatchFlowValueChangeEvent(event.target.name, event.detail.newValue, event.detail.newValueDataType);
        };
    }


    dispatchFlowValueChangeEvent(id, newValue, dataType = DATA_TYPE.STRING) {
        console.log('in dispatchFlowValueChangeEvent: ' + id, newValue, dataType);
        if (this.inputValues[id] && this.inputValues[id].serialized) {
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

    handleCheckboxChange(event) {
        this.isChecked = event.target.checked;
      }

}
