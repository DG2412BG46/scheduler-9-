import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// NLU API: Parses natural language input into structured work objects
app.post("/api/parse-work", async (req, res) => {
  try {
    const { input, referenceDate } = req.body;
    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return res.status(400).json({ error: "Input text is required" });
    }

    const ai = getGeminiClient();
    const todayStr = referenceDate || new Date().toISOString().split("T")[0];
    const todayDayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

    // If Gemini is available, use it for rich parsing
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: `Parse this student's task input into a structured work object: "${input.trim()}"`,
          config: {
            systemInstruction: `You are an intelligent academic parser for high school and college students.
Today's date is ${todayStr} (${todayDayName}).
Parse the user's natural language input into a structured work item of ONE of three types:
1. "homework": An assignment, problem set, reading, essay, worksheet, or project with estimated duration and due date.
2. "quiz_test": A quiz, exam, midterm, final, or test. It has an assessment date/time AND requested study minutes (e.g., "need 2 hours to study" -> studyMinutesRequired = 120).
3. "goal": Ongoing weekly target work (e.g., "Practice USACO for 5 hours this week", "AMC 180 min/week", "PSAT prep 7h/week"). Has weeklyTargetMinutes.

Guidelines:
- If duration is in hours, convert to minutes (e.g. 2 hours = 120).
- If relative dates are mentioned (e.g. "Friday", "due Monday", "tomorrow"), calculate the exact YYYY-MM-DD based on today (${todayStr}, ${todayDayName}).
- Default focusRequirement to "high" for test prep/USACO/AMC/coding/hard subjects, "medium" for regular homework, "low" for simple reading/Spanish/worksheets.
- canDoAtSchool: true if suitable for school free periods/study hall (reading, worksheet, Spanish, vocabulary, lighter review), false if requires deep computer focus or intense quiet.
- splittable: true if homework is > 60m and can be split into multiple study sessions.
- priority: "low" | "medium" | "high". Default "medium" unless specified or high-stakes (e.g., tests/major goals).`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                workType: {
                  type: Type.STRING,
                  description: "Must be 'homework', 'quiz_test', or 'goal'",
                },
                name: {
                  type: Type.STRING,
                  description: "Title of the work (e.g. 'Physics Test', 'Economics Worksheet', 'USACO Practice')",
                },
                subject: {
                  type: Type.STRING,
                  description: "Academic subject or class (e.g. 'Physics', 'Economics', 'Computer Science', 'Math')",
                },
                durationMinutes: {
                  type: Type.INTEGER,
                  description: "Estimated duration in minutes for homework, or study minutes required for quiz/test",
                },
                assessmentType: {
                  type: Type.STRING,
                  description: "For quiz_test: 'quiz' or 'test'",
                },
                dueDate: {
                  type: Type.STRING,
                  description: "YYYY-MM-DD due date for homework",
                },
                dueTime: {
                  type: Type.STRING,
                  description: "HH:mm optional due time",
                },
                assessmentDate: {
                  type: Type.STRING,
                  description: "YYYY-MM-DD date for quiz_test",
                },
                assessmentTime: {
                  type: Type.STRING,
                  description: "HH:mm optional time of test",
                },
                weeklyTargetMinutes: {
                  type: Type.INTEGER,
                  description: "Target minutes per week for goals (e.g. 300 for 5 hours/week)",
                },
                priority: {
                  type: Type.STRING,
                  description: "'low', 'medium', or 'high'",
                },
                focusRequirement: {
                  type: Type.STRING,
                  description: "'low', 'medium', or 'high'",
                },
                canDoAtSchool: {
                  type: Type.BOOLEAN,
                  description: "Whether this task can reasonably be done during school free periods",
                },
                splittable: {
                  type: Type.BOOLEAN,
                  description: "Whether this task can be split across multiple sessions",
                },
                notes: {
                  type: Type.STRING,
                  description: "Any extra notes extracted from input",
                },
              },
              required: ["workType", "name", "priority"],
            },
          },
        });

        const text = response.text?.trim() || "{}";
        const parsed = JSON.parse(text);
        return res.json({ success: true, item: parsed, source: "gemini" });
      } catch (err: any) {
        console.error("Gemini parse error, falling back to rule-based parser:", err);
      }
    }

    // Deterministic fallback parser if Gemini API key not present or error occurs
    const lower = input.toLowerCase();
    const isQuizTest = lower.includes("test") || lower.includes("quiz") || lower.includes("exam") || lower.includes("midterm") || lower.includes("final");
    const isGoal = lower.includes("/week") || lower.includes("this week") || lower.includes("per week") || lower.includes("weekly") || lower.includes("goal");

    // Extract minutes / hours
    let duration = 60;
    const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
    const minMatch = lower.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
    if (hourMatch) {
      duration = Math.round(parseFloat(hourMatch[1]) * 60);
    } else if (minMatch) {
      duration = parseInt(minMatch[1], 10);
    }

    // Extract target date cleanly from referenceDate / todayStr
    const [refY, refM, refD] = todayStr.split("-").map(Number);
    // Use midday (12:00) to avoid any DST or timezone boundary issues
    const baseDate = new Date(refY, refM - 1, refD, 12, 0, 0);
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    let targetDate = todayStr;

    function formatLocalDate(d: Date): string {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    if (lower.includes("tomorrow")) {
      const tm = new Date(baseDate);
      tm.setDate(tm.getDate() + 1);
      targetDate = formatLocalDate(tm);
    } else {
      for (let i = 0; i < dayNames.length; i++) {
        if (lower.includes(dayNames[i])) {
          const currentDay = baseDate.getDay();
          let diff = i - currentDay;
          if (diff <= 0) diff += 7; // Next occurrence
          const target = new Date(baseDate);
          target.setDate(baseDate.getDate() + diff);
          targetDate = formatLocalDate(target);
          break;
        }
      }
    }

    // Extract subject/title
    let subject = "General";
    if (lower.includes("physics")) subject = "Physics";
    else if (lower.includes("math") || lower.includes("calculus") || lower.includes("amc")) subject = "Math";
    else if (lower.includes("chem")) subject = "Chemistry";
    else if (lower.includes("bio")) subject = "Biology";
    else if (lower.includes("econ")) subject = "Economics";
    else if (lower.includes("history") || lower.includes("usaco") || lower.includes("cs") || lower.includes("programming")) subject = "Computer Science";
    else if (lower.includes("english") || lower.includes("literature") || lower.includes("essay")) subject = "English";
    else if (lower.includes("spanish")) subject = "Spanish";

    if (isGoal) {
      return res.json({
        success: true,
        source: "fallback",
        item: {
          workType: "goal",
          name: input.replace(/(?:for|\b\d+\s*(?:hours?|hrs?|minutes?|mins?)\b|this week|per week)/gi, "").trim() || "Weekly Goal",
          subject,
          weeklyTargetMinutes: duration > 60 ? duration : 300,
          priority: "high",
          focusRequirement: "high",
          notes: input,
        },
      });
    }

    if (isQuizTest) {
      return res.json({
        success: true,
        source: "fallback",
        item: {
          workType: "quiz_test",
          name: input.replace(/(?:about|\b\d+\s*(?:hours?|hrs?|minutes?|mins?)\b|need|to study|due|on|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/gi, "").trim() || `${subject} Test`,
          subject,
          assessmentType: lower.includes("quiz") ? "quiz" : "test",
          assessmentDate: targetDate,
          assessmentTime: "09:00",
          studyMinutesRequired: duration,
          priority: "high",
          focusRequirement: "high",
          notes: input,
        },
      });
    }

    return res.json({
      success: true,
      source: "fallback",
      item: {
        workType: "homework",
        name: input.replace(/(?:about|\b\d+\s*(?:hours?|hrs?|minutes?|mins?)\b|finish|due|on|friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow)/gi, "").trim() || `${subject} Assignment`,
        subject,
        durationMinutes: duration,
        dueDate: targetDate,
        priority: "medium",
        focusRequirement: duration > 60 ? "high" : "medium",
        canDoAtSchool: duration <= 45,
        splittable: duration >= 75,
        notes: input,
      },
    });
  } catch (error: any) {
    console.error("Parse work endpoint error:", error);
    res.status(500).json({ error: error.message || "Failed to parse input" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
