/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 07-05-2023
 * @last modified by  : Josh Dayment
**/
import { api,track, LightningElement } from "lwc";
import getSObjects from "@salesforce/apex/DataFetcherController.getSObjects";
import getAggregate from "@salesforce/apex/DataFetcherController.getAggregate";
import { FlowAttributeChangeEvent } from "lightning/flowSupport";

export default class DataFetcher extends LightningElement {
  @api queryString;
  @api aggQueryString;
  @api aggQueryResult;
  @api firstRetrievedRecord;
  @api retrievedRecords = [];
  @api error;
  @track oldQuery;
  @track oldAggQuery;


  renderedCallback() {
    if (this.queryString && this.queryString != this.oldQuery) {
    this._getRecords();}
    //console.log("Records are: " + JSON.stringify(this.retrievedRecords))
    if (this.aggQueryString && this.aggQueryString != this.oldAggQuery){
        this._getAggregate();
    }
  }

  handleOnChange() {
    this._debounceGetRecords();
  }

  _getRecords() {
    
    console.log("Query String is " + this.queryString)
    
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

  _debounceGetRecords() {
    this._debounceTimer && clearTimeout(this._debounceTimer);
    if (this.queryString){
    this._debounceTimer = setTimeout(() => this._getRecords(), 300);
    }    
    if (this.aggQueryString){
      this._debounceTimer = setTimeout(() => this._getAggregate(), 300);
      }
  }  

  _fireFlowEvent(eventName, data) {
    this.dispatchEvent(new FlowAttributeChangeEvent(eventName, data));
  }

}
