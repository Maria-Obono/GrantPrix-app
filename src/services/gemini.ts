import { GoogleGenAI, Type } from "@google/genai";
import { Conference, Region, LocationType, FundingType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function searchConferences(query: string): Promise<Conference[]> {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Search for real-time information about tech conference grants and scholarships for the year 2026.
    Focus on the following query: ${query}
    
    Return a list of verified conferences that offer travel grants or scholarships for underrepresented groups (women, people of color, LGBTQ+ individuals).
    If no specific grants match the query exactly, return the most relevant tech grants available for 2026.
    
    For each grant, find a relevant high-quality image URL from a previous event of that specific conference. If a direct event photo is not found, use a high-quality, relevant image from Unsplash (https://images.unsplash.com/photo-...) that represents the conference's theme.
    
    Ensure all dates are in 2026.
    If a link is not available yet, mark it as "coming soon".
    
    For the "id", generate a unique string based on the conference name (e.g., "afrotech-2026").
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              location: { type: Type.STRING },
              region: { type: Type.STRING, enum: Object.values(Region) },
              locationType: { type: Type.STRING, enum: Object.values(LocationType) },
              fundingType: { type: Type.STRING, enum: Object.values(FundingType) },
              field: { type: Type.STRING },
              startDate: { type: Type.STRING },
              endDate: { type: Type.STRING },
              grantDeadline: { type: Type.STRING },
              grantCoverage: {
                type: Type.OBJECT,
                properties: {
                  flight: { type: Type.BOOLEAN },
                  hotel: { type: Type.BOOLEAN },
                  ticket: { type: Type.BOOLEAN },
                  stipend: { type: Type.BOOLEAN },
                },
                required: ["flight", "hotel", "ticket"],
              },
              applicationUrl: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              isComingSoon: { type: Type.BOOLEAN },
              isVerified: { type: Type.BOOLEAN },
              imageUrl: { type: Type.STRING },
            },
            required: ["id", "name", "description", "location", "region", "locationType", "fundingType", "field", "startDate", "endDate", "grantDeadline", "grantCoverage", "applicationUrl", "tags"],
          },
        },
      },
    });

    if (response.text) {
      let jsonStr = response.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      }
      try {
        return JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError, "Raw Text:", response.text);
        return [];
      }
    }
    return [];
  } catch (error) {
    console.error("Gemini Search Error:", error);
    return [];
  }
}

export async function getGrantAdvice(conference: Conference, userBackground: string) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    You are a helpful grant assistant for GrantPrix. 
    A user is interested in the following conference:
    Name: ${conference.name}
    Description: ${conference.description}
    Grant Coverage: ${JSON.stringify(conference.grantCoverage)}
    Deadline: ${conference.grantDeadline}
    Field: ${conference.field}

    The user's background/resume is: ${userBackground}

    Provide a concise response including:
    1. **Chance of Acceptance**: A percentage estimate (integer 0-100) based on their background and the conference's focus.
    2. **Advice Text**: A detailed but concise response (max 150 words) including:
       - Resume Matching: How well their skills align with the conference themes.
       - Application Strategy: 2-3 specific points they should highlight in their application to increase their chances.
       - Key Strengths: What makes them a strong candidate for this specific grant.

    Format the response as a JSON object with "score" (number) and "advice" (string) fields.
    The "advice" string should be formatted clearly with bold headings.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            advice: { type: Type.STRING },
          },
          required: ["score", "advice"],
        },
      },
    });
    
    if (response.text) {
      let jsonStr = response.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      }
      try {
        return JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("JSON Parse Error (Advice):", parseError, "Raw Text:", response.text);
        return { score: 0, advice: "Sorry, I couldn't parse the advice. Please try again." };
      }
    }
    return { score: 0, advice: "Sorry, I couldn't generate advice at this moment. Please try again later." };
  } catch (error) {
    console.error("Gemini Error:", error);
    return { score: 0, advice: "Sorry, I couldn't generate advice at this moment. Please try again later." };
  }
}

export async function verifyGrantStatus(conferenceName: string, applicationUrl: string) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Verify the current status of the scholarship/grant for the conference: ${conferenceName}.
    Official URL: ${applicationUrl}
    
    Check if the application window is currently open, closed, or if there is any new information about the 2026 grant.
    
    Return a JSON object with:
    - "isOpen": boolean (true if currently open)
    - "statusMessage": string (a short explanation of what you found, e.g., "Applications open until June 15th" or "Applications closed for 2026")
    - "lastVerified": string (today's date)
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isOpen: { type: Type.BOOLEAN },
            statusMessage: { type: Type.STRING },
            lastVerified: { type: Type.STRING },
          },
          required: ["isOpen", "statusMessage", "lastVerified"],
        },
      },
    });

    if (response.text) {
      let jsonStr = response.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      }
      try {
        return JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("JSON Parse Error (Status):", parseError, "Raw Text:", response.text);
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini Verification Error:", error);
    return null;
  }
}

export async function autofillOpportunity(name: string, url: string) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    I have a tech conference/grant opportunity.
    Name: ${name}
    Official Website: ${url}

    Please find and complete the missing information for this grant for the year 2026.
    If the name or URL is slightly off, please correct it based on your search.
    
    Required information:
    - description: A concise summary of the grant and what it covers.
    - location: City, Country (e.g., "San Francisco, USA").
    - region: One of ["Global", "North America", "Europe", "Asia", "Africa", "Latin America", "Oceania"].
    - locationType: One of ["USA", "Global", "Virtual"].
    - fundingType: One of ["Full", "Partial"].
    - field: The main industry/field (e.g., "Artificial Intelligence", "Web Development").
    - startDate: The conference start date in YYYY-MM-DD format.
    - endDate: The conference end date in YYYY-MM-DD format.
    - grantDeadline: The application deadline in YYYY-MM-DD format.
    - grantCoverage: Which of these are covered: flight (boolean), hotel (boolean), ticket (boolean), stipend (boolean).
    - tags: A list of 3-5 relevant keywords.

    Return a JSON object matching the schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            applicationUrl: { type: Type.STRING },
            description: { type: Type.STRING },
            location: { type: Type.STRING },
            region: { type: Type.STRING, enum: Object.values(Region) },
            locationType: { type: Type.STRING, enum: Object.values(LocationType) },
            fundingType: { type: Type.STRING, enum: Object.values(FundingType) },
            field: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING },
            grantDeadline: { type: Type.STRING },
            grantCoverage: {
              type: Type.OBJECT,
              properties: {
                flight: { type: Type.BOOLEAN },
                hotel: { type: Type.BOOLEAN },
                ticket: { type: Type.BOOLEAN },
                stipend: { type: Type.BOOLEAN },
              },
              required: ["flight", "hotel", "ticket", "stipend"],
            },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["name", "applicationUrl", "description", "location", "region", "locationType", "fundingType", "field", "startDate", "endDate", "grantDeadline", "grantCoverage", "tags"],
        },
      },
    });

    if (response.text) {
      let jsonStr = response.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      }
      try {
        return JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("JSON Parse Error (Autofill):", parseError, "Raw Text:", response.text);
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini Autofill Error:", error);
    return null;
  }
}

export async function assistApplication(
  type: 'improve' | 'suggest' | 'tailor',
  input: string,
  conference: Conference,
  userProfile: any
) {
  const model = "gemini-3-flash-preview";
  
  let taskDescription = "";
  if (type === 'improve') {
    taskDescription = "Improve the following essay/statement to be more compelling and professional.";
  } else if (type === 'suggest') {
    taskDescription = `Suggest a strong answer for this application question: "${input}"`;
  } else {
    taskDescription = `Tailor the following response specifically for the ${conference.name} grant, highlighting the user's relevant strengths.`;
  }

  const prompt = `
    You are an expert grant application assistant for GrantPrix.
    Grant: ${conference.name} (${conference.field})
    Description: ${conference.description}
    
    User Context:
    Goal: ${userProfile.primaryGoal || 'Professional growth in tech'}
    Occupation: ${userProfile.occupation || 'Technologist'}
    Experience: ${userProfile.experienceYears || 0} years
    Interests: ${userProfile.interests?.join(', ') || 'Technology, Innovation'}
    
    Task: ${taskDescription}
    ${type !== 'suggest' ? `Input Text: "${input}"` : ''}
    
    Provide your response in JSON format. Do not include any markdown formatting outside the JSON object.
    {
      "output": "The improved text or suggested answer",
      "explanation": "A brief explanation of the strategy used (max 50 words)",
      "tips": ["Tip 1", "Tip 2"]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            output: { type: Type.STRING },
            explanation: { type: Type.STRING },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["output", "explanation", "tips"],
        },
      },
    });

    if (response.text) {
      let jsonStr = response.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      }
      try {
        return JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("JSON Parse Error (Assistance):", parseError, "Raw Text:", response.text);
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini Assistance Error:", error);
    return null;
  }
}
