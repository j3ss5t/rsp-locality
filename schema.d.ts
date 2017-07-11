import {xObject} from "../../types";

export interface PoiCategoryObject {
  id: string;
  name: string;
  uri: string;
}

export interface LocationObject {
  id: string;
  name: string;
  uri: string;
  city?: string;
  country?: string;
  district?: string;
  geometry?: Object;
  housenumber?: string;
  language?: string;
  nameInLocalLanguage?: string;
  nearbyLocations?: LocationObject;
  poiCategories?: PoiCategoryObject[];
  poiName?: string;
  position?: string;
  postcode?: string;
  rating?: number;
  road?: string;
  roadType?: string;
  state?: string;
  telephone?: string;
}

export interface SearchObject {
  id: string;
  name: string;
  uri: string;
  bounds?: Object;
  location?: LocationObject;
  needle?: string;
  radius?: number;
  radiusUnit?: string;
  results?: SearchResultObject[];
  status?: "idle" | "running" | "complete";
}

export interface SearchResultObject {
  id: string;
  name: string;
  uri: string;
  parent?: SearchObject;
  reference?: LocationObject;
}
