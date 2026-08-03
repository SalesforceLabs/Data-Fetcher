/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 12-20-2023
 * @last modified by  : Josh Dayment
**/
import { api, track, wire, LightningElement } from "lwc";
import { getListRecordsByName, getListInfoByName } from "lightning/uiListsApi";
import getSObjects from "@salesforce/apex/DataFetcherController.getSObjects";
import getAggregate from "@salesforce/apex/DataFetcherController.getAggregate";
import getSearchObjects from "@salesforce/apex/DataFetcherController.getSearchObjects";
import { FlowAttributeChangeEvent } from "lightning/flowSupport";

export default class DataFetcher extends LightningElement {
  @api queryString;
  @api aggQueryString;
  @api aggQueryResult;
  @api firstRetrievedRecord;
  @api retrievedRecords = [];
  @api error;
  @api searchString;
  @api searchResults = [];
  @api searchResults1 = [];
  @api objectName1 = 'Account';
  @api objectName2 = 'Account';
  @api debounceTime;
  @api useWireService = false;
  @api listViewApiName;
  @api pageToken;
  @api pageSize = 50;
  @api sortBy;
  @api fields;
  @api nextPageToken;
  @track _wireFields;
  @track _wireSortBy;
  @track oldQuery;
  @track oldAggQuery;
  @track oldSearchQuery;
  @track displayError;

  @wire(getListInfoByName, {
    objectApiName: "$objectName1",
    listViewApiName: "$listViewApiName"
  })
  wiredListInfo({ error, data }) {
    if (!this.useWireService) return;

    if (data && data.displayColumns) {
      const columnFields = data.displayColumns
        .map(col => `${this.objectName1}.${col.fieldApiName}`);

      const additionalFields = this.fields && this.objectName1
        ? this.fields.split(',').map(f => {
            const trimmed = f.trim();
            return trimmed.includes('.') ? trimmed : `${this.objectName1}.${trimmed}`;
          })
        : [];

      const allFields = [...new Set([...columnFields, ...additionalFields])];

      if (JSON.stringify(allFields) !== JSON.stringify(this._wireFields)) {
        this._wireFields = allFields;
      }
    } else if (error) {
      this.error = error?.body?.message || JSON.stringify(error);
      this._fireFlowEvent("error", this.error);
    }
  }

  @wire(getListRecordsByName, {
    objectApiName: "$objectName1",
    listViewApiName: "$listViewApiName",
    optionalFields: "$_wireFields",
    pageSize: "$pageSize",
    sortBy: "$_wireSortBy",
    pageToken: "$pageToken"
  })
  wiredListRecords({ error, data }) {
    if (!this.useWireService) return;

    if (data) {
      this.error = undefined;
      const flatRecords = this._transformUIApiRecords(data.records);
      this.retrievedRecords = flatRecords;
      this.firstRetrievedRecord = flatRecords.length > 0 ? flatRecords[0] : null;
      this.nextPageToken = data.nextPageToken || null;
      this._fireFlowEvent("retrievedRecords", this.retrievedRecords);
      this._fireFlowEvent("firstRetrievedRecord", this.firstRetrievedRecord);
      this._fireFlowEvent("nextPageToken", this.nextPageToken);
    } else if (error) {
      let errorMsg;
      if (Array.isArray(error.body)) {
        errorMsg = error.body.map(e => e.message).join('; ');
      } else if (error.body && error.body.message) {
        errorMsg = error.body.message;
      } else {
        errorMsg = JSON.stringify(error);
      }
      this.error = errorMsg;
      this.retrievedRecords = [];
      this.firstRetrievedRecord = null;
      this._fireFlowEvent("error", this.error);
    }
  }

  renderedCallback() {
    if (this.useWireService) {
      this._computeWireParams();
      return;
    }

    if (this.queryString && this.queryString != this.oldQuery) {
      this._getRecords();
    }

    if (this.aggQueryString && this.aggQueryString != this.oldAggQuery){
      this._getAggregate();
    }

    if (this.searchString && this.searchString != this.oldSearchQuery) {
      this._getSearchResults();
    }
  }

  _computeWireParams() {
    const newSortBy = this.sortBy
      ? this.sortBy.split(',').map(s => s.trim())
      : undefined;

    if (JSON.stringify(newSortBy) !== JSON.stringify(this._wireSortBy)) {
      this._wireSortBy = newSortBy;
    }
  }

  _transformUIApiRecords(records) {
    if (!records || !Array.isArray(records)) return [];
    return records.map(record => {
      const flat = {
        attributes: { type: record.apiName || this.objectName1 },
        Id: record.id
      };
      if (record.fields) {
        Object.entries(record.fields).forEach(([key, field]) => {
          flat[key] = field.value;
        });
      }
      return flat;
    });
  }

  handleOnChange() {
    this._debounceGetRecords();
    
  }

  _getRecords() {
    
      getSObjects({ queryString: this.queryString })
        .then(({ results, firstResult }) => {
          this.error = undefined;
          this.retrievedRecords = results;
          this.firstRetrievedRecord = firstResult;
          this._fireFlowEvent("firstRetrievedRecord", this.firstRetrievedRecord);
          this._fireFlowEvent("retrievedRecords", this.retrievedRecords);
        })
        .catch(error => 
          {this.error = error?.body?.message ?? JSON.stringify(error);
          console.error(error.body.message);
          this._fireFlowEvent("error", this.error);});

        this.oldQuery = this.queryString;
    
  }

  _getAggregate() {
    
    //console.log("Query String is " + this.aggQueryString)
    
      getAggregate({ aggQueryString: this.aggQueryString })
        .then(({ aggAmount, }) => {
          this.error = undefined;
          this.aggQueryResult = aggAmount;
          this._fireFlowEvent("aggQueryResult", this.aggQueryResult);
        })
        .catch(error => 
          {this.error = error?.body?.message ?? JSON.stringify(error);
          console.error(error.body.message);
          this._fireFlowEvent("error", this.error);});

        this.oldAggQuery = this.aggQueryString;
    
  }

  _getSearchResults() {
    
    //console.log("Query String is " + this.searchString)
    
    getSearchObjects({ searchString: this.searchString })
        .then(({ searchList0, searchList1 }) => {
          this.error = undefined;
          this.searchResults = searchList0;
          this.searchResults1 = searchList1;          
          this._fireFlowEvent("searchResults", this.searchResults);
          this._fireFlowEvent("searchResults1", this.searchResults1);
        })
        .catch(error => 
          {this.error = error?.body?.message ?? JSON.stringify(error);
          console.error(error.body.message);
          this._fireFlowEvent("error", this.error);});

        this.oldSearchQuery = this.searchString;
    
  }

  _debounceGetRecords() {    
    this._debounceTimer && clearTimeout(this._debounceTimer);
    if (this.queryString){
    this._debounceTimer = setTimeout(() => this._getRecords(), this.debounceTime);    
    }
    if (this.searchString){
    this._debounceTimer = setTimeout(() => this._getSearchResults(), this.debounceTime);
    }
    if (this.aggQueryString){
      this._debounceTimer = setTimeout(() => this._getAggregate(), this.debounceTime);
      }
    
  }  

  _fireFlowEvent(eventName, data) {
    this.dispatchEvent(new FlowAttributeChangeEvent(eventName, data));
  }

  get displayError() {
    if (this.error && this.showErrorMessage){
      this.displayError = true;
    };
  }

}