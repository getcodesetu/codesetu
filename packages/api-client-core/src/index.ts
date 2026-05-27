/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type {
  ApiKeyAuth,
  ApiKeyLocation,
  Auth,
  AuthType,
  BasicAuth,
  BearerAuth,
  BodyMode,
  Collection,
  CollectionNode,
  Environment,
  FolderNode,
  FormDataField,
  GraphQlBody,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  KeyValue,
  OAuth2Auth,
  OAuth2GrantType,
  RawLanguage,
  RequestBody,
  RequestNode,
  RequestProtocol,
  RequestScripts,
  RequestSettings,
  ResponseCookie,
  ResponseTimings,
  TestResult,
  Variable,
  VariableScope,
  WebSocketMessageFormat,
  WebSocketRequest,
  WebSocketSavedMessage,
} from "./model.js";

export {
  createCollection,
  createDefaultHttpRequest,
  createDefaultSettings,
  createDefaultWebSocketRequest,
  createEmptyBody,
  createFolderNode,
  createNoneAuth,
  createRequestNode,
  newId,
} from "./factory.js";

export {
  importCollections,
  importHar,
  importInsomnia,
  importOpenApi,
  importPostman,
  isHar,
  isInsomniaExport,
  isOpenApi,
  isPostmanCollection,
  parseCurl,
  type ImportFormat,
  type ImportResult,
} from "./import/index.js";
export { exportPostman, generateCode, type CodegenTarget } from "./export/index.js";

export { applyAuth, type AuthApplication } from "./engine/auth.js";
export { buildBody, type BuiltBody, type FileReader } from "./engine/body.js";
export { isTextualContentType, mimeOf } from "./engine/contentType.js";
export { parseSetCookie, parseSetCookies } from "./engine/cookies.js";
export { executeHttpRequest, type ExecuteOptions } from "./engine/http.js";
export {
  buildVariableMap,
  hasUnresolvedVariables,
  resolveVariables,
} from "./engine/variables.js";
