import { BehaviorSubject, Subject } from '@reactivex/rxjs';
import * as uuid from "uuid";
import { rsiLogger } from "../../log";

import { Service, Resource, Element, ResourceUpdate, StatusCode, ElementResponse, CollectionResponse } from "../rsiPlugin";
import { LocationObject, SearchObject, SearchResultObject } from "./schema";

import { createClient, GoogleMapsClient } from '@google/maps';

class Locality extends Service {
  constructor() {
    super();
    this.id = "a7a1073f-e91f-4c56-8468-f4d6bd1d8c96"; //random id
    this.resources.push(new Locations(this));
    this.resources.push(new SearchResults(this));
    this.resources.push(new Searches(this));
  }
}

interface LocationElement extends Element {
  data: LocationObject;
}

class Locations implements Resource {
  static mapMatchedLocationId = "d6ebae81-d2c1-11e6-9376-df943f51f0d8";

  private _name: string;
  private _locations: BehaviorSubject<LocationElement>[] = [];
  private _change: BehaviorSubject<ResourceUpdate>;
  private _logger = rsiLogger.getInstance().getLogger("locality");

  constructor(private service: Service) {
    let mapMatchedLocation = new BehaviorSubject<LocationElement>({
      lastUpdate: Date.now(),
      propertiesChanged: [],
      data: {
        uri: "/" + this.service.name.toLowerCase() + "/" + this.name.toLowerCase() + "/" + Locations.mapMatchedLocationId,
        id: Locations.mapMatchedLocationId,
        name: "map matched location - current car position"
      }
    });
    this._locations.push(mapMatchedLocation);

    this._change = new BehaviorSubject(<ResourceUpdate>{ lastUpdate: Date.now(), action: 'init' });
  }

  get name(): string {
    return this.constructor.name;
  };

  get elementSubscribable(): Boolean {
    return true;
  };

  get change(): BehaviorSubject<ResourceUpdate> {
    return this._change;
  }

  getElement(elementId: string): ElementResponse {
    // find the element requested by the client
    return {
      status: "ok",
      data: this._locations.find((element: BehaviorSubject<LocationElement>) => {
        return (<{ id: string }>element.getValue().data).id === elementId;
      })
    };
  };

  getResource(offset?: string | number, limit?: string | number): CollectionResponse {
    // retriev all element
    let resp: BehaviorSubject<LocationElement>[];

    if ((typeof offset === "number" && typeof limit === "number") || (typeof limit === "number" && !offset) || (typeof offset === "number" && !limit) || (!offset && !limit)) {
      resp = this._locations.slice(<number>offset, <number>limit);
    }

    return { status: "ok", data: resp };
  };

  createElement(state: any): ElementResponse {
    if (!state.name) return {
      status: "error",
      error: new Error('providing a name is mandatory'),
      code: StatusCode.INTERNAL_SERVER_ERROR
    };
    const locationId = uuid.v1();

    /** build the actual location and add it to the collections*/
    let newLocation = new BehaviorSubject<LocationElement>(
      {
        lastUpdate: Date.now(),
        propertiesChanged: [],
        data: {
          uri: "/" + this.service.name.toLowerCase() + "/" + this.name.toLowerCase() + "/" + locationId,
          id: locationId,
          name: state.name
        }
      });
    this._locations.push(newLocation);

    /** publish a resource change */
    this._change.next({ lastUpdate: Date.now(), action: "add" });

    /** return success */
    return { status: "ok", data: newLocation };
  };
}

interface SearchElement extends Element {
  data: SearchObject;
}

class Searches implements Resource {
  private _name: string;
  private _searches: BehaviorSubject<SearchElement>[] = [];
  private _change: BehaviorSubject<ResourceUpdate>;
  private _logger = rsiLogger.getInstance().getLogger("locality");
  private googleClient: GoogleMapsClient;
  private searchResultResource: SearchResults;

  constructor(private service: Service) {
    this._change = new BehaviorSubject(<ResourceUpdate>{ lastUpdate: Date.now(), action: 'init' });
    this.googleClient = createClient({
      key: 'AIzaSyDj1SdJs4oAFoxpjKpFWp0GqJisWi7VLbE',
    });
    this.searchResultResource = <SearchResults>service.getResource("SearchResults");
  }

  geocodeAddress(request: google.maps.GeocoderRequest): Promise<google.maps.GeocoderResult[]> {
    return new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
      this.googleClient.geocode(request, (error, response) => {
        if (error) {
          reject(error);
        }

        resolve(response.json.results);
      });
    });
  };

  get name(): string {
    return this.constructor.name;
  };

  get elementSubscribable(): Boolean {
    return true;
  };

  get change(): BehaviorSubject<ResourceUpdate> {
    return this._change;
  }

  getElement(elementId: string): ElementResponse {
    // find the element requested by the client
    return {
      status: "ok",
      data: this._searches.find((element: BehaviorSubject<SearchElement>) => {
        return (<{ id: string }>element.getValue().data).id === elementId;
      })
    };
  };

  getResource(offset?: string | number, limit?: string | number): CollectionResponse {
    // retriev all element
    let resp: BehaviorSubject<SearchElement>[];

    if ((typeof offset === "number" && typeof limit === "number") || (typeof limit === "number" && !offset) || (typeof offset === "number" && !limit) || (!offset && !limit)) {
      resp = this._searches.slice(<number>offset, <number>limit);
    }

    return { status: "ok", data: resp };
  };

  updateElement(elementId: string, difference: any): ElementResponse {
    let element = (<BehaviorSubject<SearchElement>>this.getElement(elementId).data);
    var searchObject: SearchObject = element.getValue().data;
    let propertiesChanged: string[] = [];

    if (difference.hasOwnProperty("needle")) {
      searchObject.needle = difference.needle;
      propertiesChanged.push("needle");
    }

    if (difference.hasOwnProperty("status")) {
      if (-1 !== ["idle", "running", "complete"].indexOf(difference.shuffle)) {
        searchObject.status = difference.status;
        propertiesChanged.push("status");
      }
    }

    let resp = {
      lastUpdate: Date.now(),
      propertiesChanged: propertiesChanged,
      data: searchObject
    };

    element.next(resp); // @TODO: check diffs bevor updating without a need

    const request: google.maps.GeocoderRequest = {
      address: searchObject.needle,
      region: "DE"
    };

    this.geocodeAddress(request).then((results) => {
      let search: SearchElement = element.getValue();

      console.log(results);

      for (let entry of results) {
        let entryId = uuid.v1();
        let searchResult: SearchResultObject = {
          id: entryId,
          name: entry.formatted_address,
          uri: "/" + this.service.name.toLowerCase() + "/" + this.searchResultResource.name.toLowerCase() + "/" + entryId
        };

        // add result to resource
        this.searchResultResource.addElement(searchResult);

        // clear results
        search.data.results = [];

        // push result to result array of search
        search.data.results.push(searchResult);
      }

      element.next(
        {
          lastUpdate: Date.now(),
          propertiesChanged: ["results"],
          data: search.data
        });
    });

    return { status: "ok" };
  };

  createElement(state: any): ElementResponse {
    if (!state.name) return {
      status: "error",
      error: new Error('providing a name is mandatory'),
      code: StatusCode.INTERNAL_SERVER_ERROR
    };

    if (!state.needle) return {
      status: "error",
      error: new Error('providing a needle is mandatory'),
      code: StatusCode.INTERNAL_SERVER_ERROR
    };

    const newSearchId = uuid.v1();

    /** build the actual location and add it to the collections*/
    let newSearch = new BehaviorSubject<SearchElement>(
      {
        lastUpdate: Date.now(),
        propertiesChanged: [],
        data: {
          uri: "/" + this.service.name.toLowerCase() + "/" + this.name.toLowerCase() + "/" + newSearchId,
          id: newSearchId,
          name: state.name,
          needle: state.needle,
          results: [],
          status: "idle",
        }
      });
    this._searches.push(newSearch);

    /** publish a resource change */
    this._change.next({ lastUpdate: Date.now(), action: "add" });

    const request: google.maps.GeocoderRequest = {
      address: state.needle,
      region: "DE"
    };

    this.geocodeAddress(request).then((results) => {
      let search: SearchElement = newSearch.getValue();

      for (let entry of results) {
        let entryId = uuid.v1();
        let searchResult: SearchResultObject = {
          id: entryId,
          name: entry.formatted_address,
          uri: "/" + this.service.name.toLowerCase() + "/" + this.searchResultResource.name.toLowerCase() + "/" + entryId
        };

        // add result to resource
        this.searchResultResource.addElement(searchResult);

        // push result to result array of search
        search.data.results.push(searchResult);
      }

      newSearch.next(
        {
          lastUpdate: Date.now(),
          propertiesChanged: ["results"],
          data: search.data
        });
    });

    /** return success */
    return { status: "ok", data: newSearch };
  };

  deleteElement(elementId: string): ElementResponse {
    let idx = this._searches.findIndex((element: BehaviorSubject<SearchElement>, index: number) => {
      return (<{ id: string }>element.getValue().data).id === elementId;
    });
    if (-1 !== idx) {
      this._searches.splice(idx, 1); //remove one item from the collections array
      return { status: "ok" };
    }
    return { status: "error", code: 404, message: "Element can not be found" };
  };
}

interface SearchResultElement extends Element {
  data: SearchResultObject;
}

class SearchResults implements Resource {
  private _name: string;
  private _searchResults: BehaviorSubject<SearchResultElement>[] = [];
  private _change: BehaviorSubject<ResourceUpdate>;
  private _logger = rsiLogger.getInstance().getLogger("locality");

  constructor(private service: Service) {
    this._change = new BehaviorSubject(<ResourceUpdate>{ lastUpdate: Date.now(), action: 'init' });
  }

  get name(): string {
    return this.constructor.name;
  };

  get elementSubscribable(): Boolean {
    return true;
  };

  get change(): BehaviorSubject<ResourceUpdate> {
    return this._change;
  }

  getElement(elementId: string): ElementResponse {
    // find the element requested by the client
    return {
      status: "ok",
      data: this._searchResults.find((element: BehaviorSubject<SearchResultElement>) => {
        return (<{ id: string }>element.getValue().data).id === elementId;
      })
    };
  };

  getResource(offset?: string | number, limit?: string | number): CollectionResponse {
    // retriev all element
    let resp: BehaviorSubject<SearchResultElement>[];

    if ((typeof offset === "number" && typeof limit === "number") || (typeof limit === "number" && !offset) || (typeof offset === "number" && !limit) || (!offset && !limit)) {
      resp = this._searchResults.slice(<number>offset, <number>limit);
    }

    return { status: "ok", data: resp };
  };

  addElement(searchResult: SearchResultObject): void {
    /** build the actual location and add it to the collections*/
    let newSearchResult = new BehaviorSubject<SearchResultElement>(
      {
        lastUpdate: Date.now(),
        propertiesChanged: [],
        data: searchResult
      });
    this._searchResults.push(newSearchResult);

    /** publish a resource change */
    this._change.next({ lastUpdate: Date.now(), action: "add" });
  };
}

export {Locality as Service};
