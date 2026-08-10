export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'jina-embeddings-v2-base-en',
        input: [text],
      }),
    });

    if (!res.ok) return null;
    
    const data = await res.json();
    if (data?.data?.[0]?.embedding) {
      return data.data[0].embedding;
    }
    return null;
  } catch {
    return null;
  }
}
