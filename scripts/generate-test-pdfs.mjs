import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test", "fixtures", "pdfs");
await mkdir(outDir, { recursive: true });

const MARGIN = 50;
const LINE_H = 14;
const FONT_SIZE = 11;
const MAX_W = 500;

function wrapParagraph(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars) line = next;
    else {
      if (line) lines.push(line);
      line = w.length > maxChars ? w.slice(0, maxChars) : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapBody(text, maxChars = 92) {
  return text.split(/\n\n/).flatMap((p) => {
    const trimmed = p.trim();
    if (!trimmed) return [];
    return wrapParagraph(trimmed, maxChars);
  });
}

async function makePdf(filename, title, pagesContent) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let pi = 0; pi < pagesContent.length; pi++) {
    const page = doc.addPage([612, 792]);
    const { width, height } = page.getSize();
    let y = height - MARGIN;

    page.drawText(title, {
      x: MARGIN,
      y: y - 20,
      size: 16,
      font: bold,
      color: rgb(0.1, 0.1, 0.2),
    });
    y -= 48;
    page.drawText(`Page ${pi + 1} of ${pagesContent.length}`, {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.45),
    });
    y -= 28;

    const lines = wrapBody(pagesContent[pi]);
    for (const line of lines) {
      if (y < MARGIN + LINE_H) break;
      page.drawText(line, {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0.15, 0.15, 0.18),
        maxWidth: width - 2 * MARGIN,
      });
      y -= LINE_H;
    }
  }

  const bytes = await doc.save();
  await writeFile(path.join(outDir, filename), bytes);
  console.log("wrote", path.join("test", "fixtures", "pdfs", filename));
}

const docs = [
  {
    file: "test-chemistry-notes.pdf",
    title: "Organic Chemistry — Quick Notes (Test Document)",
    pages: [
      `Introduction to functional groups. Alkanes are saturated hydrocarbons with single carbon-carbon bonds. They follow the general formula CnH2n+2. Common reactions include free-radical halogenation under UV light, where a hydrogen is replaced by a halogen.

Alkenes contain at least one carbon-carbon double bond and are more reactive than alkanes. Electrophilic addition is characteristic: for example, bromine water decolorizes when added to an alkene due to addition across the double bond. Markovnikov's rule predicts regioselectivity when adding HX to unsymmetrical alkenes.

This document is synthetic content for backend PDF extraction and chunking tests. It spans multiple pages so pagination and text flow can be validated.`,

      `Carbonyl chemistry overview. Aldehydes and ketones feature a polar C=O bond, making the carbon electrophilic. Nucleophiles such as cyanide, Grignard reagents, and hydride donors add to the carbonyl carbon.

Carboxylic acids and derivatives include esters, amides, and acid chlorides. Relative reactivity toward nucleophilic acyl substitution generally follows: acid chloride > anhydride > ester ~ acid > amide. Hydrolysis of esters under basic conditions is saponification.

Buffers in biological systems often involve weak acids and conjugate bases. The Henderson-Hasselbalch equation relates pH, pKa, and the ratio of conjugate base to acid. Titration curves show distinct equivalence points for polyprotic species.`,

      `Laboratory safety reminders for instructional labs. Always wear appropriate PPE: splash goggles, lab coat, and closed-toe shoes. Know locations of eyewash, safety shower, and fire extinguisher. Never taste or smell chemicals directly; use wafting if odor must be assessed.

Waste segregation matters: halogenated organics, aqueous metals, and non-halogenated solvents often go into different streams. Label all unknowns clearly. Document observations in a bound notebook with dates and initials.

These paragraphs are filler for multi-page PDF testing. Topics mentioned are educational summaries only and not a substitute for a real course syllabus.`,
    ],
  },
  {
    file: "test-recipe-booklet.pdf",
    title: "Weekend Recipes — Test PDF",
    pages: [
      `Rustic tomato soup serves four. Ingredients: two tablespoons olive oil, one diced onion, three cloves garlic minced, two cans whole tomatoes, two cups vegetable broth, one teaspoon sugar, salt and pepper, fresh basil.

Saute onion in oil until soft, add garlic briefly, then tomatoes and broth. Simmer twenty minutes, blend until smooth, season, and finish with basil. Serve with crusty bread.

Chocolate chip cookies: cream butter and sugars, beat in eggs and vanilla, fold in flour, baking soda, salt, then chips. Chill dough thirty minutes. Bake at 175 degrees Celsius until edges are golden.`,

      `Vegetarian lentil stew. Rinse one cup red lentils. Soften carrots, celery, and onion in oil, add spices (cumin, coriander, smoked paprika), lentils, diced tomatoes, and four cups water. Simmer until lentils break down. Stir in lemon juice and cilantro.

Breakfast: overnight oats with rolled oats, milk or oat drink, chia seeds, maple syrup, and berries. Combine in a jar, refrigerate overnight, top with nuts in the morning.

This booklet exists for software testing of document upload pipelines. Nutritional values are not calculated.`,

      `Kitchen equipment notes for testers: a heavy-bottomed pot reduces scorching when simmering soups. A digital thermometer helps with meat doneness. Sharp knives are safer than dull ones because they require less force.

Meal prep strategy: cook grains and roast vegetables on Sunday, store in airtight containers, assemble bowls with protein and dressing during the week. Label containers with dates.

Final page disclaimer: recipes are simplified; adjust seasoning to taste. This PDF is for automated extraction testing only.`,
    ],
  },
  {
    file: "test-world-history-outline.pdf",
    title: "World History — Outline (Sample)",
    pages: [
      `The Industrial Revolution transformed production, transport, and daily life from the late eighteenth century onward. Steam power, textile machinery, and coke-smelted iron expanded factory output. Urbanization accelerated as workers moved toward mills and mines.

Colonial expansion and trade networks linked continents but also imposed extractive economies and cultural disruption. Resistance and reform movements emerged in many regions throughout the nineteenth century.

This outline is fabricated study notes for PDF parsing tests only.`,

      `The twentieth century saw two world wars, decolonization, and the Cold War. International institutions such as the United Nations aimed to reduce conflict and coordinate development. Technological change—from radio to computing—reshaped communication and warfare.

Environmental awareness grew after mid-century as industrial pollution and resource limits became visible. Climate agreements reflect ongoing negotiation between growth and sustainability.

Additional filler text ensures this page exceeds a single screen of plain text for chunking benchmarks.`,

      `Primary sources include letters, official records, photographs, and artifacts. Historians weigh provenance, bias, and gaps in the archive. Secondary sources synthesize debates; tertiary materials like textbooks summarize fields.

Digital humanities tools help map trade routes, analyze corpora, and visualize timelines. Methodological transparency strengthens reproducibility in historical argument.

End of sample outline. Content is not peer-reviewed; use only as a binary PDF fixture for development.`,
    ],
  },
  {
    file: "test-programming-tips.pdf",
    title: "Programming Tips — Dummy Reference",
    pages: [
      `Prefer small functions with clear names over clever one-liners. Version control with meaningful commits simplifies bisection when bugs appear. Automated tests catch regressions early; integration tests complement unit tests for APIs and databases.

Security basics: validate input at boundaries, avoid concatenating user data into SQL, store secrets in environment variables or a vault, and keep dependencies updated. Logging should be structured enough to diagnose production issues without leaking PII.

This PDF is intentionally generic to exercise text extraction on technical vocabulary.`,

      `Async patterns in Node: understand the event loop, avoid blocking the main thread with CPU-heavy work, and use backpressure when streaming. For databases, use connection pooling and parameterized queries.

API design: consistent error shapes, pagination for lists, and idempotency keys for sensitive writes improve client experience. Document rate limits and authentication schemes openly.

More filler lines for page length: refactoring, linting, type checking, and code review all reduce long-term cost compared to shipping quickly without guardrails.`,

      `Observability: metrics for latency and error rates, traces for slow requests, and logs correlated with request IDs. Feature flags decouple deployment from release. Database migrations should be backward compatible when rolling out in stages.

This third page completes a three-page technical PDF for search and RAG pipeline experiments. No warranty on advice; consult official docs for your stack.`,
    ],
  },
  {
    file: "test-travel-madrid-notes.pdf",
    title: "Travel Notes — Madrid (Fictional Itinerary)",
    pages: [
      `Day one: arrive midday, check in near Sol, walk to Plaza Mayor and Mercado de San Miguel for tapas. Evening stroll in La Latina. Day two: Prado museum in the morning, Retiro Park picnic, sunset from Temple of Debod viewpoint.

Day three: day trip suggestion to Toledo for medieval streets and cathedral. Return by train in the evening. Pack comfortable shoes; many historic centers use cobblestones.

All itinerary details are invented for PDF testing. Verify real opening hours before travel.`,

      `Transport: Metro is efficient; consider a multi-day pass. Taxis and ride-hail apps work well from the airport. Spanish meal times run later than some visitors expect; lunch near 14:00 and dinner after 21:00 is common.

Phrases: hola, gracias, la cuenta por favor. Most tourist areas accommodate English, but basic Spanish is appreciated.

Closing filler: museums may require timed tickets in peak season. Hydrate in summer heat. This document is not a travel guide.`,

      `Accessibility: many metro stations have elevators but not all; check maps if mobility is a concern. Cash is less common than cards in central areas; carry a small amount for tiny vendors.

Weather: spring and fall are mild; July and August can be very hot. Layer clothing for cool mornings and warm afternoons.

Third page ends the fictional Madrid notes PDF used for multi-page upload and embedding tests in the backend repository.`,
    ],
  },
];

for (const d of docs) {
  await makePdf(d.file, d.title, d.pages);
}
