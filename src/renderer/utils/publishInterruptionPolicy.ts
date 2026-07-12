export function resolveInterruptedPublishStatus<T extends string>(
  publishStarted: boolean,
  beforeCommitStatus: T,
): 'uncertain' | T {
  return publishStarted ? 'uncertain' : beforeCommitStatus;
}
