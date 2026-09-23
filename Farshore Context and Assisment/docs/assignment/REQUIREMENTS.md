# Professor's supplied requirements

Source: `original/CMPS_4200_HCI_Phase_1_Project_Requirements.pdf`, two pages. This is a verified development summary, not a replacement for the original. Only Phase 1 instructions were supplied.

## Course and phase

The course focuses on user-centered interfaces that integrate pretrained AI models. Learning objectives include intuitive UI, effective model integration, user-centered AI design, trust and ethics, prototyping, testing, and iteration. [Page 1]

Phase 1 covers project concept, user research, and AI model exploration. The brief gives a two-week duration and a weight of 15% of the final course grade. It describes teams of 2-3 students. The user has already submitted and presented this phase. [Page 1; submission status from the user]

## Deliverables

| Deliverable | Share of Phase 1 grade | Requirements | Source |
| --- | --- | --- | --- |
| Project proposal | 35% | Define the problem; identify primary and secondary user groups; outline 5-7 core features; explain how AI improves the user experience; define success metrics | Page 1 |
| AI research and selection | 35% | Evaluate at least five pretrained models. For each, document input/output needs, API limitations and rate limits, expected response time, and costs if applicable. Choose one or two models, justify them through user needs and feasibility, and explain their place in the user flow | Page 2 |
| User research and personas | 30% | Interview at least six potential users; synthesize needs, pain points, and goals; create three detailed personas | Page 2 |

Each persona must include demographics/background, goals/motivations, pain points/frustrations, technology comfort, relationship with AI/automation, and context-of-use scenarios. [Page 2]

AI-specific research questions concern how users currently solve the problem, expectations and concerns about AI, and the transparency they need. [Page 2]

The brief suggests Hugging Face, OpenAI API, Google Cloud AI, Azure Cognitive Services, and AWS AI Services as sources. It does not mandate a particular provider, model, game engine, language, or all five models from the student's slides. [Pages 1-2]

## Applying this to the existing game

This section is development guidance, not additional professor requirements.

- Keep the real AI contribution observable: advice interpretation, Odysseus' choice, and the explanation should help the player understand consequences.
- A scripted demo alone cannot demonstrate integration with a pretrained model. Connect and test the existing model adapter.
- The slides propose five active models; the brief specifies a final selection of one or two. Keep that distinction visible when planning and documenting the implementation.
- The brief's team size and the slide's solo status differ. No instructor exception is included in these files. This does not establish that no exception exists.
- Interview evidence, detailed research tables, and model timing/memory measurements are absent from this package. Treat their status as unverified; do not infer they never happened.
- No later-phase rubric or deadline is available here. Add those instructions when the user supplies them.

Suggested measures for future testing include completing a turn without help, understanding a refusal, identifying scripted versus AI mode, recovering from a failed request, and measured response latency. These are proposed evaluation measures, not collected results.
