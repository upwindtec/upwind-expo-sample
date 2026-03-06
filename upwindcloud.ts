//
// Typescript definitions for Upwind Cloud, a cloud database service.
// These definitions are designed to mirror the Firestore API for ease of use in React Native applications, while translating calls to REST API requests under the hood.
// For more information, visit https://www.upwindtec.pt
// Note: This file is not intended to be a complete implementation of the Firestore API, but rather a subset of it that is sufficient for most applications. It can be freely adapted and extended as needed.
//
import axios, { AxiosResponse } from "axios";

export class UpwindCloudStorage {
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setIdToken(idToken: string) {
    this.idToken = idToken;
  }

  async request(
    Url: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    params: URLSearchParams | null,
    data: any | null = null,
  ): Promise<AxiosResponse> {
    let response: AxiosResponse = {} as AxiosResponse;
    // if we have an idToken, add it to the query parameters for authentication purposes
    if (this.idToken !== "") {
      if (!params) {
        params = new URLSearchParams();
      }
      params.append("idToken", this.idToken);
    }
    try {
      response = await axios({
        url: Url,
        method: method,
        params: params,
        data: data,
        baseURL: this.baseUrl,
        headers: data
          ? {
              "content-type": "application/json",
            }
          : {
              "content-type": "application/x-www-form-urlencoded",
            },
      });
    } catch (error: any) {
      if (error.response.status !== 404) {
        throw error;
      }
    }
    return Promise.resolve(response);
  }
  readonly baseUrl: string = "";
  idToken: string = "";
}

export function getFirestore(idToken?: string): UpwindCloudStorage {
  // replace the URL below with the URL of your Upwind Cloud instance
  const storage = new UpwindCloudStorage("...");
  if (idToken) {
    storage.setIdToken(idToken);
  }
  return storage;
}

export interface DocumentData {
  /** A mapping between a field and its value. */
  [field: string]: any;
}

export class Query {
  protected storage_?: UpwindCloudStorage;
  public collectionId: string;
  readonly type: "query" | "collection";
  protected constraints:
    | QueryCompositeFilterConstraint[]
    | QueryNonFilterConstraint[];

  public constructor(fromQuery?: Query) {
    this.storage_ = fromQuery ? (fromQuery.storage_ ?? undefined) : undefined;
    this.collectionId = fromQuery ? fromQuery.collectionId : "";
    this.type = fromQuery ? fromQuery.type : "query";
    this.constraints = fromQuery ? [...fromQuery.constraints] : new Array();
  }

  public storage(): UpwindCloudStorage | undefined {
    return this.storage_;
  }

  // "any" can be either QueryCompositeFilterConstraint or QueryNonFilterConstraint
  query(...queryConstraints: any[]): Query {
    this.constraints.push(...queryConstraints);
    return this;
  }

  async getDocs(): Promise<QuerySnapshot> {
    if (!this.storage_) {
      throw new Error("No storage associated with this query.");
    }

    // build the URLSearchParams from the constraints
    let queryParams: URLSearchParams = new URLSearchParams();
    if (this.constraints) {
      this.constraints.forEach((element) => {
        let parms: URLSearchParams = element.params();
        parms.forEach((key, value) => {
          // for some reason, these parameters are reversed
          queryParams.append(value, key);
        });
      });
    }
    const res = await this.storage_.request(
      `/${this.collectionId}`,
      "GET",
      queryParams,
      null,
    );
    return Promise.resolve(new QuerySnapshot(this, res.data));
  }
}

export class CollectionReference extends Query {
  readonly type = "collection";

  public constructor(
    ref: UpwindCloudStorage | CollectionReference | DocumentReference,
    path: string,
    ...pathSegments: string[]
  ) {
    super();
    this.collectionId = path;
    pathSegments.forEach((segment) => {
      this.path += `/${segment}`;
    });
    this.parent = ref instanceof DocumentReference ? ref : null;
    this.storage_ = ref instanceof UpwindCloudStorage ? ref : undefined;
  }
  path: string = "";
  readonly parent: DocumentReference | null;
}

export class DocumentReference {
  readonly type = "document";
  readonly storage?: UpwindCloudStorage;

  public constructor(
    storage?: UpwindCloudStorage,
    collectionReference?: CollectionReference,
    id?: string,
    ...pathSegments: string[]
  ) {
    this.storage = storage;
    this.id = id ?? "";
    let first = true;
    pathSegments.forEach((segment) => {
      // add slashes only before segments after the first
      if (!first) {
        this.path += "/";
      } else {
        first = false;
      }
      this.path += `${segment}`;
    });

    this.parent = collectionReference ?? null;
  }
  id: string;
  path: string = "";
  readonly parent: CollectionReference | null;
  toJSON(): object {
    return {};
  }
  static fromJSON(
    storage: UpwindCloudStorage,
    json: object,
  ): DocumentReference {
    return new DocumentReference(storage, undefined, "");
  }

  async addDoc(data: DocumentData): Promise<DocumentReference> {
    if (!this.storage) {
      throw new Error("No storage associated with this query.");
    }

    const res = await this.storage.request(`/${this.id}`, "POST", null, data);
    if (res.status === 201) {
      // Created
      this.id = res.data.Id;
    }
    return this;
  }

  async setDoc(
    data: WithFieldValue<DocumentData> | PartialWithFieldValue<DocumentData>,
    options?: SetOptions,
  ): Promise<void> {
    if (!this.storage) {
      throw new Error("No storage associated with this query.");
    }
    await this.storage.request(`/${this.id}/${this.path}`, "PUT", null, data);
  }

  async getDoc(): Promise<DocumentSnapshot> {
    if (!this.storage) {
      throw new Error("No storage associated with this query.");
    }

    const res = await this.storage.request(
      `/${this.id}/${this.path}`,
      "GET",
      null,
      null,
    );
    return Promise.resolve(new DocumentSnapshot(this, res.data));
  }

  async delete(withRelatedDocuments?: boolean): Promise<void> {
    if (!this.storage) {
      throw new Error("No storage associated with this query.");
    }

    let params: URLSearchParams = new URLSearchParams();
    params.append("Limit", "1"); // limit DELETEs to one document to avoid accidental mass deletions
    if (withRelatedDocuments ?? false) {
      params.append("DeleteRelatedItems", "true");
    }

    await this.storage.request(
      `/${this.id}/${this.path}`,
      "DELETE",
      params,
      null,
    );
  }

  async update(data: DocumentData): Promise<void> {
    if (!this.storage) {
      throw new Error("No storage associated with this query.");
    }

    await this.storage.request(`/${this.id}/${this.path}`, "PATCH", null, data);
  }
}

export type QueryConstraintType =
  | "where"
  | "orderBy"
  | "limit"
  | "limitToLast"
  | "startAt"
  | "startAfter"
  | "endAt"
  | "endBefore";
export abstract class QueryConstraint {
  abstract readonly type: QueryConstraintType;
  public abstract toJSON(): string;
  public abstract params(): URLSearchParams;
}

export class QueryCompositeFilterConstraint {
  public constructor(filterType: "or" | "and") {
    this.filterType = filterType;
  }
  readonly filterType: "or" | "and";

  public toJSON(): string {
    return "";
  }
  public params(): URLSearchParams {
    const params = new URLSearchParams();
    return params;
  }
}

export type QueryFilterConstraint =
  | QueryFieldFilterConstraint
  | QueryCompositeFilterConstraint;

export class QueryOrderByConstraint extends QueryConstraint {
  public constructor(
    fieldPath: string /*| FieldPath*/,
    directionStr?: OrderByDirection,
  ) {
    super();
    this.fieldPath = fieldPath;
    this.directionStr = directionStr;
  }
  readonly type = "orderBy";
  readonly fieldPath: string /*| FieldPath*/;
  readonly directionStr?: OrderByDirection;
  toJSON(): string {
    return (
      `\"OrderBy\":\"${this.fieldPath} ` +
      (this.directionStr == null ? "" : this.directionStr) +
      `\"`
    );
  }
  params(): URLSearchParams {
    const params = new URLSearchParams();
    params.append(
      "OrderBy",
      `${this.fieldPath} ` +
        (this.directionStr == null ? "" : this.directionStr),
    );
    return params;
  }
}

export type QueryNonFilterConstraint =
  | QueryOrderByConstraint
  | QueryLimitConstraint
  | QueryStartAtConstraint
  | QueryEndAtConstraint;

export class QueryLimitConstraint extends QueryConstraint {
  public constructor(limitType: "limit" /*| "limitToLast"*/, limit: number) {
    // limitToLast not supported
    super();
    this.type = limitType;
    this.limit = limit;
  }

  readonly type: "limit" /*| "limitToLast"*/;
  readonly limit: number;

  toJSON(): string {
    return `{"Limit":${this.limit}}`;
  }
  params(): URLSearchParams {
    const params = new URLSearchParams();
    params.append("Limit", this.limit.toString());
    return params;
  }
}

export class QueryStartAtConstraint extends QueryConstraint {
  public constructor(startType: "startAt" | "startAfter", values: any[]) {
    super();
    this.type = startType;
    this.values = values;
  }
  readonly values: any[];
  readonly type: "startAt" | "startAfter";

  toJSON(): string {
    return ``;
  }
  params(): URLSearchParams {
    const params = new URLSearchParams();
    return params;
  }
}

export class QueryEndAtConstraint extends QueryConstraint {
  public constructor(endType: "endAt" | "endBefore", values: any[]) {
    super();
    this.type = endType;
    this.values = values;
  }
  readonly values: any[];
  readonly type: "endAt" | "endBefore";

  toJSON(): string {
    return ``;
  }
  params(): URLSearchParams {
    const params = new URLSearchParams();
    return params;
  }
}

export class QueryFieldFilterConstraint extends QueryConstraint {
  readonly type = "where";
  readonly fieldPath: string /*| FieldPath*/; // FieldPath currently not supported
  readonly opStr: WhereFilterOp;
  readonly value: string;
  constructor(
    fieldPath: string /*| FieldPath*/,
    opStr: WhereFilterOp,
    value: any,
  ) {
    super();
    this.fieldPath = fieldPath;
    this.opStr = opStr;
    if (value instanceof Date) {
      this.value = (value as Date).toUTCString();
    } else {
      this.value = value.toString();
    }
  }
  toJSON(): string {
    switch (this.opStr) {
      case "==":
        return (
          `\"Where\":\"${this.fieldPath}=` + JSON.stringify(this.value) + `\"`
        );
    }
    return "";
  }
  params(): URLSearchParams {
    const params = new URLSearchParams();
    params.append("Where", `${this.fieldPath}${this.opStr}"${this.value}"`);
    return params;
  }
}

export class QuerySnapshot {
  readonly query: Query;
  readonly docsData: DocumentData;

  public constructor(query: Query, docsData: DocumentData) {
    this.query = query;
    this.docsData = docsData;
  }

  get docs(): QueryDocumentSnapshot[] {
    if (!Array.isArray(this.docsData)) {
      return [];
    }

    return this.docsData.map((item) => {
      const docRef = new DocumentReference(
        this.query.storage(),
        undefined,
        item.Id ?? "",
      );
      return new QueryDocumentSnapshot(docRef, item);
    });
  }

  get size(): number {
    return this.docs.length;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }

  forEach(
    callback: (result: QueryDocumentSnapshot) => void,
    thisArg?: unknown,
  ): void {
    this.docs.forEach(callback, thisArg);
  }

  toJSON(): object {
    return {};
  }
}

export interface SnapshotOptions {
  readonly serverTimestamps?: "estimate" | "previous" | "none";
}

export class DocumentSnapshot {
  protected documentData: DocumentData;
  readonly documentReference: DocumentReference;

  public constructor(
    documentReference: DocumentReference,
    documentData?: DocumentData,
  ) {
    this.documentReference = documentReference;
    this.documentData = documentData ?? {};
  }

  exists(): this is QueryDocumentSnapshot {
    return (
      this.documentData != null && Object.keys(this.documentData).length > 0
    );
  }

  data(options?: SnapshotOptions): DocumentData | undefined {
    return this.documentData;
  }

  get(fieldPath: string | FieldPath, options?: SnapshotOptions): any {
    return undefined;
  }

  toJSON(): object {
    return {};
  }

  get id(): string {
    return this.documentReference.id;
  }

  get ref(): DocumentReference {
    return this.documentReference;
  }
}

export class QueryDocumentSnapshot extends DocumentSnapshot {
  constructor(
    documentReference: DocumentReference,
    documentData: DocumentData,
  ) {
    super(documentReference);
    this.documentData = documentData;
  }

  data(options?: SnapshotOptions): DocumentData {
    return this.documentData;
  }
}

export class FieldPath {
  constructor(...fieldNames: string[]) {
    this.fieldNames = fieldNames;
  }
  readonly fieldNames: string[];
  isEqual(other: FieldPath): boolean {
    return JSON.stringify(this.fieldNames) === JSON.stringify(other.fieldNames);
  }
}

export type WhereFilterOp =
  | "<"
  | "<="
  | "=="
  | "!="
  | ">="
  | ">"
  | "array-contains"
  | "in"
  | "array-contains-any"
  | "not-in";

export type Primitive = string | number | boolean | undefined | null;

export class FieldValue {
  private value: string = "";

  public toJSON(): string {
    return this.value;
  }

  constructor(value: string) {
    this.value = value;
  }

  isEqual(other: FieldValue): boolean {
    return this.value === other.value;
  }

  // value 01 to start a string indicates that we are incrementing the value
  static increment(n: number): FieldValue {
    return new FieldValue("\x01" + n.toString());
  }

  // value 02 to start a string indicates that we are setting a server timestamp
  static serverTimestamp(): FieldValue {
    return new FieldValue("\x02");
  }

  // value 03 to start a string indicates that we are performing an array union
  static arrayUnion(...elements: unknown[]): FieldValue {
    return new FieldValue("\x03" + JSON.stringify(elements));
  }
}

export type WithFieldValue<T> =
  | T
  | (T extends Primitive
      ? T
      : T extends {}
        ? {
            [K in keyof T]: WithFieldValue<T[K]> | FieldValue;
          }
        : never);

export type PartialWithFieldValue<T> =
  | Partial<T>
  | (T extends Primitive
      ? T
      : T extends {}
        ? {
            [K in keyof T]?: PartialWithFieldValue<T[K]> | FieldValue;
          }
        : never);

export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

export declare type AddPrefixToKeys<
  Prefix extends string,
  T extends Record<string, unknown>,
> = {
  [K in keyof T & string as `${Prefix}.${K}`]+?: string extends K ? any : T[K];
};

export type ChildUpdateFields<K extends string, V> =
  V extends Record<string, unknown> ? AddPrefixToKeys<K, UpdateData<V>> : never;

export type NestedUpdateFields<T extends Record<string, unknown>> =
  UnionToIntersection<
    {
      [K in keyof T & string]: ChildUpdateFields<K, T[K]>;
    }[keyof T & string]
  >;

export type UpdateData<T> = T extends Primitive
  ? T
  : T extends {}
    ? {
        [K in keyof T]?: UpdateData<T[K]> | FieldValue;
      } & NestedUpdateFields<T>
    : Partial<T>;

export type SetOptions =
  | {
      readonly merge?: boolean;
    }
  | {
      readonly mergeFields?: (string | FieldPath)[];
    };

export type OrderByDirection = "desc" | "asc";

export class WriteBatch {
  private storage: UpwindCloudStorage;
  private operations: any[] = []; // aray of objects containing database operations
  constructor(storage: UpwindCloudStorage) {
    this.storage = storage;
  }
  set(
    documentRef: DocumentReference,
    data: WithFieldValue<DocumentData> | PartialWithFieldValue<DocumentData>,
    options?: SetOptions,
  ): WriteBatch {
    this.operations.push({
      op: "POST",
      collection: documentRef.id,
      parent: documentRef.parent?.path,
      path: documentRef.path,
      data: data,
      options: options,
    });
    return this;
  }
  update(documentRef: DocumentReference, data: DocumentData): WriteBatch {
    this.operations.push({
      op: "PATCH",
      collection: documentRef.id,
      parent: documentRef.parent?.path,
      path: documentRef.path,
      data: data,
    });
    return this;
  }
  delete(documentRef: DocumentReference): WriteBatch {
    this.operations.push({
      op: "DELETE",
      collection: documentRef.id,
      parent: documentRef.parent?.path,
      path: documentRef.path,
    });
    return this;
  }
  async commit(): Promise<void> {
    await this.storage.request(`/batch`, "POST", null, {
      operations: this.operations,
    });
    return Promise.resolve();
  }
}

export function collection(
  ref: UpwindCloudStorage | CollectionReference | DocumentReference,
  path: string,
  ...pathSegments: string[]
): CollectionReference {
  return new CollectionReference(ref, path, ...pathSegments);
}

export function doc(
  ref: UpwindCloudStorage | CollectionReference | DocumentReference,
  path?: string,
  ...pathSegments: string[]
): DocumentReference {
  return new DocumentReference(
    ref instanceof UpwindCloudStorage ? ref : undefined,
    ref instanceof CollectionReference ? ref : undefined,
    path ?? "",
    ...pathSegments,
  );
}

// "any" can be either QueryCompositeFilterConstraint or QueryNonFilterConstraint
export function query(query: Query, ...queryConstraints: any[]): Query {
  return query.query(...queryConstraints);
}

export function addDoc(
  ref: CollectionReference,
  data: WithFieldValue<DocumentData>,
): Promise<DocumentReference> {
  const doc: DocumentReference = new DocumentReference(
    ref.storage(),
    ref,
    ref.collectionId,
  );
  return Promise.resolve(doc.addDoc(data));
}

export async function getDoc(
  ref: DocumentReference,
): Promise<DocumentSnapshot> {
  return ref.getDoc();
}

export function setDoc(
  doc: DocumentReference,
  data: WithFieldValue<DocumentData> | PartialWithFieldValue<DocumentData>,
  options?: SetOptions,
): Promise<void> {
  return Promise.resolve(doc.setDoc(data, options));
}

export async function getDocs(query: Query): Promise<QuerySnapshot> {
  return query.getDocs();
}

export function where(
  fieldPath: string /*| FieldPath*/,
  opStr: WhereFilterOp,
  value: unknown,
): QueryFieldFilterConstraint {
  return new QueryFieldFilterConstraint(fieldPath, opStr, value);
}

export function orderBy(
  fieldPath: string /*| FieldPath*/,
  directionStr?: OrderByDirection,
): QueryOrderByConstraint {
  return new QueryOrderByConstraint(fieldPath, directionStr);
}

export function startAfter(snapshot: DocumentSnapshot): QueryStartAtConstraint {
  return new QueryStartAtConstraint("startAfter", []);
}

export function limit(limit: number): QueryLimitConstraint {
  return new QueryLimitConstraint("limit", limit);
}

export function updateDoc<T extends DocumentData>(
  ref: DocumentReference,
  data: T,
): Promise<void> {
  return Promise.resolve(ref.update(data));
}

export function deleteDoc(
  ref: DocumentReference,
  withRelatedDocuments?: boolean,
): Promise<void> {
  return Promise.resolve(ref.delete(withRelatedDocuments));
}

export function or(
  ...queryConstraints: QueryFilterConstraint[]
): QueryCompositeFilterConstraint {
  return new QueryCompositeFilterConstraint("or");
}

export function collectionGroup(
  storage: UpwindCloudStorage,
  collectionId: string,
): Query {
  return collection(storage, collectionId);
}

export function serverTimestamp(): FieldValue {
  return FieldValue.serverTimestamp();
}

export function writeBatch(storage: UpwindCloudStorage): WriteBatch {
  return new WriteBatch(storage);
}

export function arrayUnion(...elements: unknown[]): FieldValue {
  return FieldValue.arrayUnion(...elements);
}

export default UpwindCloudStorage;
