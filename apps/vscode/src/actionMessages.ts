/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { IDE_ACTIONS, type IdeActionId, type IdeContextPayload } from "@codesetu/core";

export interface EditorActionRequest {
  text: string;
  ideContext: IdeContextPayload;
}

export function buildEditorActionMessage(actionId: IdeActionId): string {
  return IDE_ACTIONS[actionId].prompt;
}

export function buildEditorActionRequest(
  actionId: IdeActionId,
  ideContext: IdeContextPayload,
): EditorActionRequest {
  return {
    text: buildEditorActionMessage(actionId),
    ideContext,
  };
}
