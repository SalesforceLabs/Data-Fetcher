/**
 * @description       : 
 * @author            : Josh Dayment
 * @group             : 
 * @last modified on  : 06-06-2023
 * @last modified by  : Josh Dayment
**/
import { api,track, LightningElement } from "lwc";
import getSObjects from "@salesforce/apex/DataFetcherController.getSObjects";
import { FlowAttributeChangeEvent } from "lightning/flowSupport";

export default class DataFetcher extends LightningElement {
  @api queryString;
  @api firstRetrievedRecord;
  @api retrievedRecords = [];
  @api error;
  @track oldQuery;


  renderedCallback() {
    if (this.queryString && this.queryString != this.oldQuery) {
    this._getRecords();}
    //console.log("Records are: " + JSON.stringify(this.retrievedRecords))
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

  _debounceGetRecords() {
    this._debounceTimer && clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._getRecords(), 300);
  }  

  _fireFlowEvent(eventName, data) {
    this.dispatchEvent(new FlowAttributeChangeEvent(eventName, data));
  }
}
