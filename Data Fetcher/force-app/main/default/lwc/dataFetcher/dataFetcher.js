/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 02-16-2024
 * @last modified by  : Josh Dayment
**/
import { api, track, LightningElement } from "lwc";
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
  @track oldQuery;
  @track oldAggQuery;
  @track oldSearchQuery;


  renderedCallback() {
    if (this.queryString && this.queryString != this.oldQuery) {
    this._getRecords();
  }
    //console.log("Records are: " + JSON.stringify(this.retrievedRecords))
    if (this.aggQueryString && this.aggQueryString != this.oldAggQuery){
        this._getAggregate();
    }
    if (this.searchString && this.searchString != this.oldSearchQuery) {
      this._getSearchResults();
    }
  }

  handleOnChange() {
    this._debounceGetRecords();
  }

  _getRecords() {
    
    //console.log("Query String is " + this.queryString)
    
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
        //.catch(error => 
          //{this.error = error?.body?.message ?? JSON.stringify(error);
          //console.error(error.body.message);
          //this._fireFlowEvent("error", this.error);});
          //});

        this.oldSearchQuery = this.searchString;
    
  }

  _debounceGetRecords() {
    this._debounceTimer && clearTimeout(this._debounceTimer);
    if (this.queryString){
    this._debounceTimer = setTimeout(() => this._getRecords(), 300);
    }
    if (this.searchString){
    this._debounceTimer = setTimeout(() => this._getSearchResults(), 300);
    }
    if (this.aggQueryString){
      this._debounceTimer = setTimeout(() => this._getAggregate(), 300);
      }
  }  

  _fireFlowEvent(eventName, data) {
    this.dispatchEvent(new FlowAttributeChangeEvent(eventName, data));
  }

}
