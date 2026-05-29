
async function testDify() {
  const apiKey = "app-x7PQeI1BjJQY7ept1AZq57Dg";
  const baseUrl = "https://api.dify.ai/v1";

  console.log("Testing Dify API Key...");
  try {
    const res = await fetch(`${baseUrl}/parameters`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (e) {
    console.error("Fetch failed:", e);
  }
}

testDify();
