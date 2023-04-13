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
    console.log("Records are: " + JSON.stringify(this.retrievedRecords))
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
        .catch(this._displayError);

        this.oldQuery = this.queryString;
    
  }

  _debounceGetRecords() {
    this._debounceTimer && clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._getRecords(), 300);
  }

  _displayError(error) {
    this.error = error?.body?.message ?? JSON.stringify(error);
    console.error(error);
    this._fireFlowEvent("error", this.error);
  }

  _fireFlowEvent(eventName, data) {
    this.dispatchEvent(new FlowAttributeChangeEvent(eventName, data));
  }
}