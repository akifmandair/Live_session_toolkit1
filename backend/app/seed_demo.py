"""Seed the database with realistic demo data covering every feature.

Run from the backend/ directory with the venv active:

    python -m app.seed_demo

Safe to re-run: it deletes any previous demo data (matched by the demo
facilitator's email) before recreating it, so it never duplicates rows.
"""
import random
from datetime import datetime, timedelta

from .database import Base, SessionLocal, engine
from . import models
from .security import hash_password

DEMO_EMAIL = "Rabiya.Jamil@angellanepartners.com"
DEMO_PASSWORD = "Demo@12345"
DEMO_NAME = "Rabiya Jamil"


def build_option(text, is_correct=False):
    return models.Option(text=text, is_correct=is_correct)


def build_question(prompt, question_type="multiple_choice", mode="quiz", options=None,
                    settings=None, has_correct_answer=False, section_title=None,
                    section_description=None):
    return models.Question(
        prompt=prompt,
        question_type=question_type,
        mode=mode,
        settings=settings or {},
        has_correct_answer=has_correct_answer,
        section_title=section_title,
        section_description=section_description,
        options=options or [],
    )


def add_response(db, question, participant, *, option=None, text_answer=None,
                  selected_option_ids=None, numeric_answer=None, grid_answers=None,
                  file_url=None, is_correct=None, submitted_at=None):
    response = models.ResponseRecord(
        question_id=question.id,
        participant_id=participant.id,
        option_id=option.id if option else None,
        answer_data={
            "text_answer": text_answer,
            "selected_option_ids": selected_option_ids or [],
            "numeric_answer": numeric_answer,
            "grid_answers": grid_answers or {},
            "file_url": file_url,
            "graded_by": "exact" if is_correct is not None else None,
        },
        is_correct=is_correct,
        submitted_at=submitted_at or datetime.utcnow(),
    )
    db.add(response)
    return response


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.email == DEMO_EMAIL).first()
        if existing:
            db.delete(existing)
            db.commit()

        facilitator = models.User(
            name=DEMO_NAME,
            email=DEMO_EMAIL,
            hashed_password=hash_password(DEMO_PASSWORD),
        )
        db.add(facilitator)
        db.commit()
        db.refresh(facilitator)

        now = datetime.utcnow()

        # ------------------------------------------------------------------
        # Session 1: ENDED, public — full quiz + poll session with results,
        # leaderboard, and a wide spread of question types.
        # ------------------------------------------------------------------
        s1 = models.LiveSession(
            title="Q3 Marketing All-Hands Kickoff",
            status=models.SessionStatus.ended,
            facilitator_id=facilitator.id,
            is_public=True,
            city="London",
            country="United Kingdom",
            created_at=now - timedelta(days=3, hours=1),
            launched_at=now - timedelta(days=3),
            ended_at=now - timedelta(days=3) + timedelta(minutes=40),
        )
        db.add(s1)
        db.flush()

        warmup = models.Activity(
            session_id=s1.id, type=models.ActivityType.poll, title="Warm-up Poll",
            order_index=0, is_launched=True, is_closed=True,
            launched_at=s1.launched_at, closed_at=s1.launched_at + timedelta(minutes=10),
        )
        db.add(warmup)
        db.flush()

        q1 = build_question(
            "Which channel drove the most leads this quarter?", "multiple_choice", "poll",
            options=[build_option("Email"), build_option("Social"), build_option("Paid Ads"), build_option("Referrals")],
        )
        q1.activity_id = warmup.id
        q1.order_index = 0
        db.add(q1)

        q2 = build_question(
            "Which tools does your team use daily? (select all)", "checkboxes", "poll",
            options=[build_option("Slack"), build_option("Notion"), build_option("HubSpot"), build_option("Figma")],
        )
        q2.activity_id = warmup.id
        q2.order_index = 1
        db.add(q2)

        q3 = build_question(
            "Which region are you dialing in from?", "dropdown", "poll",
            options=[build_option("North America"), build_option("Europe"), build_option("APAC"), build_option("LATAM")],
        )
        q3.activity_id = warmup.id
        q3.order_index = 2
        db.add(q3)
        db.flush()

        trivia = models.Activity(
            session_id=s1.id, type=models.ActivityType.quiz, title="Marketing Trivia Quiz",
            order_index=1, is_launched=True, is_closed=True,
            launched_at=s1.launched_at + timedelta(minutes=12), closed_at=s1.launched_at + timedelta(minutes=35),
        )
        db.add(trivia)
        db.flush()

        t1_options = [build_option("Click-Through Rate", True), build_option("Cost-To-Reach"), build_option("Customer Trust Rating"), build_option("Content Type Report")]
        t1 = build_question("What does CTR stand for?", "multiple_choice", "quiz", options=t1_options, has_correct_answer=True)
        t1.activity_id = trivia.id
        t1.order_index = 0
        db.add(t1)
        db.flush()

        t2_options = [build_option("Google Ads", True), build_option("Facebook Ads", True), build_option("Organic SEO"), build_option("Email Newsletter")]
        t2 = build_question("Which of these are paid marketing channels? (select all that apply)", "checkboxes", "quiz", options=t2_options, has_correct_answer=True)
        t2.activity_id = trivia.id
        t2.order_index = 1
        db.add(t2)
        db.flush()

        t3 = build_question("What is the abbreviation for cost per thousand impressions?", "short_answer", "quiz",
                             settings={"correct_answer": "CPM"}, has_correct_answer=True)
        t3.activity_id = trivia.id
        t3.order_index = 2
        db.add(t3)

        t4 = build_question("On a scale of 1-10, how many total campaigns did we launch this quarter?", "linear_scale", "quiz",
                             settings={"min": 1, "max": 10, "minLabel": "Few", "maxLabel": "Many", "correct_value": 7},
                             has_correct_answer=True)
        t4.activity_id = trivia.id
        t4.order_index = 3
        db.add(t4)

        t5 = build_question("Rate our top campaign's actual internal review score", "rating", "quiz",
                             settings={"max": 5, "correct_value": 4}, has_correct_answer=True)
        t5.activity_id = trivia.id
        t5.order_index = 4
        db.add(t5)

        t6 = build_question("Match each channel to its Q3 performance tier", "multiple_choice_grid", "quiz",
                             settings={
                                 "rows": ["Email", "Social", "Paid Ads"],
                                 "columns": ["High", "Medium", "Low"],
                                 "correct_grid": {"Email": "High", "Social": "Medium", "Paid Ads": "Medium"},
                             }, has_correct_answer=True)
        t6.activity_id = trivia.id
        t6.order_index = 5
        db.add(t6)
        db.flush()

        participant_names_1 = ["Amara Chen", "Ben O'Sullivan", "Carlos Mendez", "Dana Whitfield",
                                "Ella Novak", "Farid Haidari", "Grace Ledbetter", "Hiro Tanaka",
                                "Isla Fitzgerald", "Jonas Weber"]
        participants_1 = []
        for i, name in enumerate(participant_names_1):
            p = models.Participant(session_id=s1.id, display_name=name,
                                    joined_at=s1.launched_at - timedelta(minutes=5 - i % 5))
            db.add(p)
            participants_1.append(p)
        db.flush()

        rng = random.Random(42)

        # Warm-up poll responses (no correctness)
        for p in participants_1:
            add_response(db, q1, p, option=rng.choice(q1.options))
            picks = rng.sample(q2.options, k=rng.randint(1, 3))
            add_response(db, q2, p, selected_option_ids=[o.id for o in picks])
            add_response(db, q3, p, option=rng.choice(q3.options))

        # Trivia quiz responses — vary correctness for a realistic leaderboard
        correct_streak = [True, True, True, True, True, True, False, True, True, False]
        for idx, p in enumerate(participants_1):
            got_it = correct_streak[idx % len(correct_streak)]
            chosen = t1_options[0] if got_it else rng.choice(t1_options[1:])
            add_response(db, t1, p, option=chosen, is_correct=chosen.is_correct)

            if idx % 4 != 3:  # a couple of participants skip a question, like real life
                if got_it:
                    picks = [o for o in t2_options if o.is_correct]
                else:
                    picks = rng.sample(t2_options, k=2)
                is_ok = {o.id for o in picks} == {o.id for o in t2_options if o.is_correct}
                add_response(db, t2, p, selected_option_ids=[o.id for o in picks], is_correct=is_ok)

            answer_text = "CPM" if got_it else rng.choice(["CPC", "CPA", "ROI"])
            add_response(db, t3, p, text_answer=answer_text, is_correct=answer_text.strip().upper() == "CPM")

            val = 7 if got_it else rng.choice([4, 5, 6, 8, 9])
            add_response(db, t4, p, numeric_answer=val, is_correct=val == 7)

            rating_val = 4 if got_it else rng.choice([2, 3, 5])
            add_response(db, t5, p, numeric_answer=rating_val, is_correct=rating_val == 4)

            grid = {"Email": "High", "Social": "Medium", "Paid Ads": "Medium"} if got_it else {
                "Email": "Medium", "Social": "High", "Paid Ads": "Low",
            }
            add_response(db, t6, p, grid_answers=grid, is_correct=grid == t6.settings["correct_grid"])

        # ------------------------------------------------------------------
        # Session 2: LIVE — one activity already closed, one still open, to
        # demonstrate the in-progress facilitator/participant experience.
        # ------------------------------------------------------------------
        s2 = models.LiveSession(
            title="Product Roadmap Deep-Dive",
            status=models.SessionStatus.live,
            facilitator_id=facilitator.id,
            is_public=True,
            city="Berlin",
            country="Germany",
            created_at=now - timedelta(minutes=30),
            launched_at=now - timedelta(minutes=20),
        )
        db.add(s2)
        db.flush()

        pulse = models.Activity(
            session_id=s2.id, type=models.ActivityType.poll, title="Roadmap Pulse Check",
            order_index=0, is_launched=True, is_closed=True,
            launched_at=s2.launched_at, closed_at=s2.launched_at + timedelta(minutes=8),
        )
        db.add(pulse)
        db.flush()

        p1_opts = [build_option("AI Summaries"), build_option("Mobile App"), build_option("Integrations"), build_option("Dark Mode")]
        p1 = build_question("Which upcoming feature excites you most?", "multiple_choice", "poll", options=p1_opts)
        p1.activity_id = pulse.id
        p1.order_index = 0
        db.add(p1)

        p2 = build_question("How would you rate today's session so far?", "rating", "poll", settings={"max": 5})
        p2.activity_id = pulse.id
        p2.order_index = 1
        db.add(p2)
        db.flush()

        live_quiz = models.Activity(
            session_id=s2.id, type=models.ActivityType.quiz, title="Roadmap Knowledge Quiz",
            order_index=1, is_launched=True, is_closed=False,
            launched_at=s2.launched_at + timedelta(minutes=10),
        )
        db.add(live_quiz)
        db.flush()

        lq1_opts = [build_option("Q1", ), build_option("Q2"), build_option("Q3"), build_option("Q4", True)]
        lq1 = build_question("Which quarter are we targeting for the mobile launch?", "multiple_choice", "quiz",
                              options=lq1_opts, has_correct_answer=True)
        lq1.activity_id = live_quiz.id
        lq1.order_index = 0
        db.add(lq1)

        lq2_opts = [build_option("iOS", True), build_option("Android", True), build_option("Windows"), build_option("Linux")]
        lq2 = build_question("Which platforms will v2 support? (select all)", "checkboxes", "quiz",
                              options=lq2_opts, has_correct_answer=True)
        lq2.activity_id = live_quiz.id
        lq2.order_index = 1
        db.add(lq2)

        lq3 = build_question("In one sentence, what's the main goal of the new analytics dashboard?", "paragraph", "quiz",
                              settings={"correct_answer": "Help teams track engagement in real time"}, has_correct_answer=True)
        lq3.activity_id = live_quiz.id
        lq3.order_index = 2
        db.add(lq3)
        db.flush()

        participant_names_2 = ["Priya Raman", "Lukas Becker", "Sofia Rinaldi", "Noah Fischer", "Mei Lin", "Oscar Palmer"]
        participants_2 = []
        for i, name in enumerate(participant_names_2):
            p = models.Participant(session_id=s2.id, display_name=name,
                                    joined_at=s2.launched_at - timedelta(minutes=2))
            db.add(p)
            participants_2.append(p)
        db.flush()

        for p in participants_2:
            add_response(db, p1, p, option=rng.choice(p1_opts))
            add_response(db, p2, p, numeric_answer=rng.randint(3, 5))

        # Live quiz: only the first question has been answered so far by most —
        # this activity is still open, so responses are partial (realistic
        # mid-session snapshot).
        for idx, p in enumerate(participants_2):
            chosen = lq1_opts[3] if idx % 3 != 0 else rng.choice(lq1_opts[:3])
            add_response(db, lq1, p, option=chosen, is_correct=chosen.is_correct)
            if idx < 3:  # only some participants have reached question 2 so far
                picks = [o for o in lq2_opts if o.is_correct] if idx != 1 else [lq2_opts[0], lq2_opts[2]]
                is_ok = {o.id for o in picks} == {o.id for o in lq2_opts if o.is_correct}
                add_response(db, lq2, p, selected_option_ids=[o.id for o in picks], is_correct=is_ok)

        # ------------------------------------------------------------------
        # Session 3: DRAFT, private — never launched, showcases the builder
        # with more question types (file upload, checkbox grid) and zero
        # participants/responses, as a fresh not-yet-run session looks.
        # ------------------------------------------------------------------
        s3 = models.LiveSession(
            title="Team Trivia Night",
            status=models.SessionStatus.draft,
            facilitator_id=facilitator.id,
            is_public=False,
            created_at=now - timedelta(days=1),
        )
        db.add(s3)
        db.flush()

        draft_activity = models.Activity(
            session_id=s3.id, type=models.ActivityType.quiz, title="Friday Trivia",
            order_index=0, is_launched=False, is_closed=False,
        )
        db.add(draft_activity)
        db.flush()

        d1_opts = [build_option("Mars", True), build_option("Venus"), build_option("Jupiter"), build_option("Saturn")]
        d1 = build_question("Which planet is known as the Red Planet?", "multiple_choice", "quiz",
                             options=d1_opts, has_correct_answer=True)
        d1.activity_id = draft_activity.id
        d1.order_index = 0
        db.add(d1)

        d2 = build_question("Name the largest ocean on Earth.", "short_answer", "quiz",
                             settings={"correct_answer": "Pacific Ocean"}, has_correct_answer=True)
        d2.activity_id = draft_activity.id
        d2.order_index = 1
        db.add(d2)

        d3 = build_question("Upload a photo of your workspace setup!", "file_upload", "poll")
        d3.activity_id = draft_activity.id
        d3.order_index = 2
        db.add(d3)

        d4 = build_question("When are you free for the next trivia night?", "checkbox_grid", "poll",
                             settings={"rows": ["Monday", "Wednesday", "Friday"], "columns": ["Morning", "Afternoon", "Evening"]})
        d4.activity_id = draft_activity.id
        d4.order_index = 3
        db.add(d4)
        db.flush()

        # ------------------------------------------------------------------
        # Session 4: ENDED, public — a lighter single-activity feedback poll
        # with a bigger participant spread, for the "discover" directory and
        # simple results charts.
        # ------------------------------------------------------------------
        s4 = models.LiveSession(
            title="Customer Feedback Pulse",
            status=models.SessionStatus.ended,
            facilitator_id=facilitator.id,
            is_public=True,
            city="New York",
            country="United States",
            created_at=now - timedelta(days=7, hours=2),
            launched_at=now - timedelta(days=7, hours=2) + timedelta(minutes=2),
            ended_at=now - timedelta(days=7, hours=1, minutes=30),
        )
        db.add(s4)
        db.flush()

        feedback_activity = models.Activity(
            session_id=s4.id, type=models.ActivityType.poll, title="Feedback Poll",
            order_index=0, is_launched=True, is_closed=True,
            launched_at=s4.launched_at, closed_at=s4.launched_at + timedelta(minutes=25),
        )
        db.add(feedback_activity)
        db.flush()

        f1_opts = [build_option("Very satisfied"), build_option("Satisfied"), build_option("Neutral"), build_option("Unsatisfied")]
        f1 = build_question("How satisfied are you with our onboarding?", "multiple_choice", "poll", options=f1_opts)
        f1.activity_id = feedback_activity.id
        f1.order_index = 0
        db.add(f1)

        f2 = build_question("How likely are you to recommend us? (0-10)", "linear_scale", "poll",
                             settings={"min": 0, "max": 10, "minLabel": "Not likely", "maxLabel": "Very likely"})
        f2.activity_id = feedback_activity.id
        f2.order_index = 1
        db.add(f2)
        db.flush()

        participant_names_4 = ["Riley Adams", "Tomas Novak", "Zara Ahmed", "Liam O'Brien", "Chidi Okafor",
                                "Ines Moreau", "Yuki Sato", "Pablo Herrera", "Nadia Petrova", "Sam Whitaker",
                                "Aiden Brooks", "Leila Haddad"]
        f1_weights = [0.4, 0.3, 0.2, 0.1]
        for name in participant_names_4:
            p = models.Participant(session_id=s4.id, display_name=name,
                                    joined_at=s4.launched_at - timedelta(seconds=rng.randint(0, 120)))
            db.add(p)
            db.flush()
            add_response(db, f1, p, option=rng.choices(f1_opts, weights=f1_weights)[0])
            add_response(db, f2, p, numeric_answer=rng.choices(range(0, 11), weights=[1,1,1,1,2,3,5,8,10,9,6])[0])

        db.commit()

        print("Demo data seeded successfully.")
        print(f"Facilitator login -> email: {DEMO_EMAIL}  password: {DEMO_PASSWORD}")
        print(f"Session codes -> {s1.title}: {s1.code} (ended, public)")
        print(f"                 {s2.title}: {s2.code} (live, public — quiz still open)")
        print(f"                 {s3.title}: {s3.code} (draft, private)")
        print(f"                 {s4.title}: {s4.code} (ended, public)")
    finally:
        db.close()


FACILITATOR_PASSWORD = "Demo@12345"

# Each facilitator: their own account + one flagship session with a closed
# warm-up poll (so the dashboard/results already show data) and a *launched,
# still-open* main quiz — so joining with the session code drops a
# participant straight into a live question instead of an empty lobby.
FACILITATORS = [
    {
        "name": "Priya Sharma", "email": "priya.sharma@demo.lst",
        "session_title": "World Geography Challenge", "is_public": True,
        "city": "Mumbai", "country": "India",
        "warmup_title": "Warm-up Poll",
        "warmup_questions": [
            ("Which continent would you most like to visit?", "multiple_choice",
             ["Asia", "Europe", "Africa", "South America"]),
            ("Preferred trip length?", "dropdown",
             ["Weekend", "1 week", "2 weeks", "1 month+"]),
        ],
        "quiz_title": "Geography Quiz",
        "quiz_questions": [
            {"prompt": "Which country has the largest population?", "question_type": "multiple_choice", "mode": "quiz",
             "options": [("India", True), ("China", False), ("USA", False), ("Indonesia", False)]},
            {"prompt": "What is the capital of Australia?", "question_type": "dropdown", "mode": "quiz",
             "options": [("Sydney", False), ("Canberra", True), ("Melbourne", False), ("Perth", False)]},
            {"prompt": "Which of these are landlocked countries? (select all)", "question_type": "checkboxes", "mode": "quiz",
             "options": [("Switzerland", True), ("Nepal", True), ("Portugal", False), ("Austria", True)]},
            {"prompt": "Which river is the longest in the world?", "question_type": "short_answer", "mode": "quiz",
             "settings": {"correct_answer": "Nile"}},
            {"prompt": "How confident do you feel about world geography?", "question_type": "linear_scale", "mode": "poll",
             "settings": {"min": 1, "max": 5, "minLabel": "Not at all", "maxLabel": "Very confident"}},
        ],
        "participants": ["Zoe Bennett", "Arjun Mehta", "Clara Dubois", "Kwame Asante", "Mia Lindqvist"],
    },
    {
        "name": "James Carter", "email": "james.carter@demo.lst",
        "session_title": "Sales Team Weekly Pulse", "is_public": False,
        "city": None, "country": None,
        "warmup_title": "Warm-up Poll",
        "warmup_questions": [
            ("Which region are you covering?", "multiple_choice", ["North", "South", "East", "West"]),
        ],
        "quiz_title": "Weekly Pulse Quiz",
        "quiz_questions": [
            {"prompt": "Which deal stage needs the most attention this week?", "question_type": "multiple_choice", "mode": "poll",
             "options": [("Prospecting", False), ("Negotiation", False), ("Closing", False), ("Onboarding", False)]},
            {"prompt": "Rate your energy level this week", "question_type": "rating", "mode": "poll",
             "settings": {"max": 5}},
            {"prompt": "What's our target close rate for Q4?", "question_type": "multiple_choice", "mode": "quiz",
             "options": [("15%", False), ("20%", True), ("25%", False), ("30%", False)]},
            {"prompt": "What CRM tool does our team use?", "question_type": "short_answer", "mode": "quiz",
             "settings": {"correct_answer": "Salesforce"}},
        ],
        "participants": ["Derek Holt", "Maya Singh", "Owen Blackwell", "Renee Farouk", "Ivy Chandler"],
    },
    {
        "name": "Fatima Al-Sayed", "email": "fatima.alsayed@demo.lst",
        "session_title": "Science & Tech Trivia", "is_public": True,
        "city": "Dubai", "country": "United Arab Emirates",
        "warmup_title": "Warm-up Poll",
        "warmup_questions": [
            ("Which tech topic excites you most?", "multiple_choice", ["AI", "Robotics", "Space", "Biotech"]),
        ],
        "quiz_title": "Science & Tech Quiz",
        "quiz_questions": [
            {"prompt": "What does 'AI' stand for?", "question_type": "multiple_choice", "mode": "quiz",
             "options": [("Artificial Intelligence", True), ("Automated Interface", False), ("Advanced Integration", False), ("Analog Input", False)]},
            {"prompt": "Which of these are programming languages? (select all)", "question_type": "checkboxes", "mode": "quiz",
             "options": [("Python", True), ("HTML", False), ("Java", True), ("CSS", False)]},
            {"prompt": "Match each planet to its position from the sun", "question_type": "multiple_choice_grid", "mode": "quiz",
             "settings": {"rows": ["Venus", "Earth", "Mars"], "columns": ["2nd", "3rd", "4th"],
                          "correct_grid": {"Venus": "2nd", "Earth": "3rd", "Mars": "4th"}}},
            {"prompt": "In one sentence, what is a black hole?", "question_type": "paragraph", "mode": "quiz",
             "settings": {"correct_answer": "A region of space with gravity so strong not even light can escape"}},
        ],
        "participants": ["Hassan Rahimi", "Lina Kovač", "Omar Suleiman", "Aisha Bello", "Dmitri Volkov"],
    },
    {
        "name": "Tom Richards", "email": "tom.richards@demo.lst",
        "session_title": "Engineering All-Hands Retro", "is_public": False,
        "city": None, "country": None,
        "warmup_title": "Warm-up Poll",
        "warmup_questions": [
            ("How was your week?", "multiple_choice", ["Great", "Good", "Okay", "Rough"]),
        ],
        "quiz_title": "Retro Quiz",
        "quiz_questions": [
            {"prompt": "Which area improved most this sprint?", "question_type": "multiple_choice", "mode": "poll",
             "options": [("Code Quality", False), ("Velocity", False), ("Testing", False), ("Collaboration", False)]},
            {"prompt": "Rate your comfort with these practices", "question_type": "checkbox_grid", "mode": "poll",
             "settings": {"rows": ["CI/CD", "Code Review", "Pair Programming"], "columns": ["Comfortable", "Learning", "Not sure"]}},
            {"prompt": "What HTTP status code means 'Not Found'?", "question_type": "multiple_choice", "mode": "quiz",
             "options": [("200", False), ("301", False), ("404", True), ("500", False)]},
            {"prompt": "What does 'CI' stand for in CI/CD?", "question_type": "short_answer", "mode": "quiz",
             "settings": {"correct_answer": "Continuous Integration"}},
        ],
        "participants": ["Nina Petrov", "Caleb Osei", "Ruth Alvarado", "Felix Grant", "Sana Iqbal"],
    },
    {
        "name": "Sofia Marín", "email": "sofia.marin@demo.lst",
        "session_title": "Movie Buffs Quiz Night", "is_public": True,
        "city": "Madrid", "country": "Spain",
        "warmup_title": "Warm-up Poll",
        "warmup_questions": [
            ("Favorite movie genre?", "multiple_choice", ["Action", "Comedy", "Drama", "Sci-Fi"]),
        ],
        "quiz_title": "Movie Trivia",
        "quiz_questions": [
            {"prompt": "Which movie won Best Picture at the 2023 Oscars?", "question_type": "multiple_choice", "mode": "quiz",
             "options": [("Everything Everywhere All at Once", True), ("Top Gun: Maverick", False), ("The Fabelmans", False), ("Avatar: The Way of Water", False)]},
            {"prompt": "Which of these are Christopher Nolan films? (select all)", "question_type": "checkboxes", "mode": "quiz",
             "options": [("Inception", True), ("Interstellar", True), ("Titanic", False), ("Oppenheimer", True)]},
            {"prompt": "Who directed 'Jaws'?", "question_type": "dropdown", "mode": "quiz",
             "options": [("Steven Spielberg", True), ("George Lucas", False), ("James Cameron", False), ("Ridley Scott", False)]},
            {"prompt": "Rate the last movie you watched", "question_type": "rating", "mode": "poll",
             "settings": {"max": 5}},
        ],
        "participants": ["Leo Fontaine", "Grace Kim", "Mateo Rossi", "Willa Jansen", "Ahmed Nasser"],
    },
]


def seed_live_facilitators():
    """5 independent facilitator accounts, each with one session (a mix of
    public/private) whose main quiz is already LAUNCHED and left open — so
    joining with the session code drops straight into a live question
    instead of the "waiting for facilitator" lobby.
    """
    db = SessionLocal()
    rng = random.Random(7)
    try:
        now = datetime.utcnow()
        summary = []

        for spec in FACILITATORS:
            existing = db.query(models.User).filter(models.User.email == spec["email"]).first()
            if existing:
                db.delete(existing)
                db.commit()

            facilitator = models.User(
                name=spec["name"], email=spec["email"],
                hashed_password=hash_password(FACILITATOR_PASSWORD),
            )
            db.add(facilitator)
            db.commit()
            db.refresh(facilitator)

            session = models.LiveSession(
                title=spec["session_title"],
                status=models.SessionStatus.live,
                facilitator_id=facilitator.id,
                is_public=spec["is_public"],
                city=spec["city"], country=spec["country"],
                created_at=now - timedelta(minutes=45),
                launched_at=now - timedelta(minutes=40),
            )
            db.add(session)
            db.flush()

            # --- Warm-up poll: already run and closed, with results ---
            warmup = models.Activity(
                session_id=session.id, type=models.ActivityType.poll, title=spec["warmup_title"],
                order_index=0, is_launched=True, is_closed=True,
                launched_at=session.launched_at, closed_at=session.launched_at + timedelta(minutes=8),
            )
            db.add(warmup)
            db.flush()

            warmup_questions = []
            for idx, (prompt, qtype, option_texts) in enumerate(spec["warmup_questions"]):
                opts = [build_option(t) for t in option_texts]
                q = build_question(prompt, qtype, "poll", options=opts)
                q.activity_id = warmup.id
                q.order_index = idx
                db.add(q)
                warmup_questions.append(q)
            db.flush()

            # --- Main quiz: launched now, left OPEN (is_closed=False) ---
            quiz = models.Activity(
                session_id=session.id, type=models.ActivityType.quiz, title=spec["quiz_title"],
                order_index=1, is_launched=True, is_closed=False,
                launched_at=now - timedelta(minutes=3),
            )
            db.add(quiz)
            db.flush()

            quiz_questions = []
            for idx, spec_q in enumerate(spec["quiz_questions"]):
                options = spec_q.get("options")
                settings = dict(spec_q.get("settings") or {})
                has_correct = spec_q["mode"] == "quiz" and (
                    (options and any(is_correct for _, is_correct in options))
                    or "correct_answer" in settings or "correct_value" in settings
                    or bool(settings.get("correct_grid"))
                )
                built_options = [build_option(text, is_correct) for text, is_correct in (options or [])]
                q = build_question(spec_q["prompt"], spec_q["question_type"], spec_q["mode"],
                                    options=built_options, settings=settings, has_correct_answer=bool(has_correct))
                q.activity_id = quiz.id
                q.order_index = idx
                db.add(q)
                quiz_questions.append(q)
            db.flush()

            # --- Participants: everyone answers the (closed) warm-up poll;
            # only the first couple have started the still-open quiz, so a
            # freshly-joining participant has the full quiz ahead of them ---
            participants = []
            for name in spec["participants"]:
                p = models.Participant(session_id=session.id, display_name=name,
                                        joined_at=session.launched_at - timedelta(minutes=1))
                db.add(p)
                participants.append(p)
            db.flush()

            for p in participants:
                for q in warmup_questions:
                    if q.question_type in {"multiple_choice", "dropdown"}:
                        add_response(db, q, p, option=rng.choice(q.options))
                    elif q.question_type == "checkboxes":
                        picks = rng.sample(q.options, k=rng.randint(1, len(q.options)))
                        add_response(db, q, p, selected_option_ids=[o.id for o in picks])

            for p in participants[:2]:
                first_q = quiz_questions[0]
                if first_q.question_type in {"multiple_choice", "dropdown"}:
                    chosen = rng.choice(first_q.options)
                    add_response(db, first_q, p, option=chosen,
                                 is_correct=chosen.is_correct if first_q.has_correct_answer else None)
                elif first_q.question_type == "checkboxes":
                    picks = rng.sample(first_q.options, k=rng.randint(1, len(first_q.options)))
                    is_ok = {o.id for o in picks} == {o.id for o in first_q.options if o.is_correct}
                    add_response(db, first_q, p, selected_option_ids=[o.id for o in picks],
                                 is_correct=is_ok if first_q.has_correct_answer else None)

            db.commit()
            summary.append((spec["name"], spec["email"], session.title, session.code, spec["is_public"]))

        print("\nLive join-ready facilitators seeded successfully.")
        print(f"All facilitator passwords: {FACILITATOR_PASSWORD}\n")
        for name, email, title, code, is_public in summary:
            visibility = "public" if is_public else "private (code only)"
            print(f"  {name:<16} {email:<28} \"{title}\" -> code {code}  [{visibility}]")
        print("\nJoin any of them at /join with the code above — the main quiz is already live and open.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    seed_live_facilitators()
