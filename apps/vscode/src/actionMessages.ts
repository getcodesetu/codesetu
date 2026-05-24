/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { IDE_ACTIONS, type IdeActionId } from "@codesetu/core";

export function buildEditorActionMessage(actionId: IdeActionId): string {
  return IDE_ACTIONS[actionId].prompt;
}
