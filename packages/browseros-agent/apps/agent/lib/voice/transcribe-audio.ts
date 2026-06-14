export async function transcribeAudio(_audioBlob: Blob): Promise<string> {
  throw new Error(
    'Voice transcription is disabled in this private build until a local transcription provider is configured.',
  )
}
