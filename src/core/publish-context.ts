import { AsyncLocalStorage } from "node:async_hooks";

interface PublishContext {
  operationKey: string;
}

const context = new AsyncLocalStorage<PublishContext>();

export class DirectAdapterPublishError extends Error {
  readonly name = "DirectAdapterPublishError";
}

export async function withAuthorizedPublish<T>(
  operationKey: string,
  operation: () => Promise<T>
): Promise<T> {
  return context.run({ operationKey }, operation);
}

export function requireAuthorizedPublish(): string {
  const active = context.getStore();
  if (!active) {
    throw new DirectAdapterPublishError(
      "Direct adapter publication is forbidden. Route mutations through NemoQwenOrchestrator so authority, duplicate protection and receipts are enforced."
    );
  }
  return active.operationKey;
}
