import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useGamePlayConfig } from "../context/GamePlayContext";
import { formatTimer } from "../games/settings";
import { recordGameAttempt } from "../lib/gameAccess";

type EquipmentCard = {
  name: string;
  purpose: string;
  image: string;
};

const labEquipmentGame: EquipmentCard[] = [
  {
    name: "Beaker",
    purpose: "Hold, mix, and roughly measure liquids",
    image: "/lab-equipment/beaker.png",
  },
  {
    name: "Buret",
    purpose: "Deliver precise liquid volumes in titrations",
    image: "/lab-equipment/buret.png",
  },
  {
    name: "Volumetric Pipet",
    purpose: "Transfer one exact volume accurately",
    image: "/lab-equipment/volumetric-pipet.png",
  },
  {
    name: "Graduated Pipet",
    purpose: "Measure and transfer variable liquid volumes",
    image: "/lab-equipment/pipet.png",
  },
  {
    name: "Thermometer",
    purpose: "Measure temperature changes in solutions",
    image: "/lab-equipment/thermometer.png",
  },
  {
    name: "Watch Glass",
    purpose: "Cover beakers or evaporate small samples",
    image: "/lab-equipment/watch-glass.png",
  },
  {
    name: "Erlenmeyer Flask",
    purpose: "Swirl solutions without splashing",
    image: "/lab-equipment/erlenmeyer-flask.png",
  },
  {
    name: "Volumetric Flask",
    purpose: "Prepare solutions to an exact final volume",
    image: "/lab-equipment/volumetric-flask.png",
  },
  {
    name: "Test Tubes",
    purpose: "Run small-scale reactions and heating",
    image: "/lab-equipment/test-tube.png",
  },
  {
    name: "Graduated Cylinder",
    purpose: "Measure liquid volume more accurately than beakers",
    image: "/lab-equipment/graduated-cylinder.png",
  },
  {
    name: "Crucible and Cover",
    purpose: "Heat solids to very high temperatures",
    image: "/lab-equipment/crucible.png",
  },
  {
    name: "Mortar and Pestle",
    purpose: "Grind solids into fine powder",
    image: "/lab-equipment/mortarpestle.png",
  },
  {
    name: "Funnel",
    purpose: "Transfer liquids and support filtration",
    image: "/lab-equipment/funnel.png",
  },
  {
    name: "Bunsen Burner",
    purpose: "Provide controlled flame for heating",
    image: "/lab-equipment/bunsen-burner.png",
  },
  {
    name: "Test Tube Holder",
    purpose: "Hold test tubes when heating",
    image: "/lab-equipment/test-tube-holder.png",
  },
  {
    name: "Scoopula",
    purpose: "Transfer solid chemicals",
    image: "/lab-equipment/scoopula.png",
  },
];

function getRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type QuestionStyle =
  | "image-to-name"
  | "description-to-name"
  | "name-to-image"
  | "both-to-name";

const QUESTION_STYLES: QuestionStyle[] = [
  "image-to-name",
  "description-to-name",
  "name-to-image",
  "both-to-name",
];

type TextQuestion = {
  card: EquipmentCard;
  style: "image-to-name" | "description-to-name" | "both-to-name";
  options: string[];
};

type ImageQuestion = {
  card: EquipmentCard;
  style: "name-to-image";
  options: EquipmentCard[];
};

type Question = TextQuestion | ImageQuestion;

const QUESTION_PROMPTS: Record<QuestionStyle, string> = {
  "image-to-name": "What equipment is shown?",
  "description-to-name": "Which equipment matches this purpose?",
  "name-to-image": "Which photo shows this equipment?",
  "both-to-name": "Identify this equipment",
};

function getQuestion(usedNames: string[]): Question {
  const unused = labEquipmentGame.filter((item) => !usedNames.includes(item.name));
  const card = unused.length > 0 ? getRandomItem(unused) : getRandomItem(labEquipmentGame);
  const style = getRandomItem(QUESTION_STYLES);
  const distractorCards = shuffle(
    labEquipmentGame.filter((item) => item.name !== card.name)
  ).slice(0, 3);

  if (style === "name-to-image") {
    return { card, style, options: shuffle([card, ...distractorCards]) };
  }

  return {
    card,
    style,
    options: shuffle([card.name, ...distractorCards.map((item) => item.name)]),
  };
}

export default function LabEquipmentGame() {
  const { user } = useAuth();
  const { settings, attemptsUsed, isTeacherPreview, classId } = useGamePlayConfig();
  const totalRounds = settings.questionCount;

  const [usedNames, setUsedNames] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [attemptRecorded, setAttemptRecorded] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    settings.timerLimitSeconds
  );

  const attemptRecordedRef = useRef(false);

  const question = useMemo(() => getQuestion(usedNames), [usedNames]);
  const isRoundLocked = selected !== null;
  const isGameComplete = round > totalRounds || timedOut;

  const recordAttempt = useCallback(async () => {
    if (!user || isTeacherPreview || attemptRecordedRef.current) {
      return;
    }
    attemptRecordedRef.current = true;
    setAttemptRecorded(true);
    try {
      await recordGameAttempt({
        userId: user.id,
        gameId: "lab-equipment",
        classId,
        score,
        questionCount: totalRounds,
      });
    } catch {
      // Attempt tracking is optional if the table is missing.
    }
  }, [user, isTeacherPreview, classId, score, totalRounds]);

  useEffect(() => {
    if (!isGameComplete) {
      return;
    }
    void recordAttempt();
  }, [isGameComplete, recordAttempt]);

  useEffect(() => {
    if (settings.timerLimitSeconds === null || isGameComplete) {
      return;
    }

    setSecondsLeft(settings.timerLimitSeconds);

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          window.clearInterval(interval);
          setTimedOut(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [settings.timerLimitSeconds, isGameComplete]);

  const handleAnswer = (choice: string) => {
    if (isRoundLocked || isGameComplete) {
      return;
    }

    const answerCorrect = choice === question.card.name;
    setSelected(choice);
    setIsCorrect(answerCorrect);
    if (answerCorrect) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (!isRoundLocked || isGameComplete) {
      return;
    }

    setUsedNames((prev) => [...prev, question.card.name]);
    setSelected(null);
    setIsCorrect(null);
    setRound((prev) => prev + 1);
  };

  const handleRestart = () => {
    attemptRecordedRef.current = false;
    setAttemptRecorded(false);
    setUsedNames([]);
    setScore(0);
    setRound(1);
    setSelected(null);
    setIsCorrect(null);
    setTimedOut(false);
    setSecondsLeft(settings.timerLimitSeconds);
  };

  const runsUsed = attemptsUsed + (attemptRecorded ? 1 : 0);
  const canPlayAgain =
    isTeacherPreview || settings.maxTries === null || runsUsed < settings.maxTries;

  const triesLabel =
    settings.maxTries === null
      ? null
      : isTeacherPreview
        ? `Tries: unlimited (preview)`
        : `Tries: ${runsUsed} / ${settings.maxTries}`;

  return (
    <main className="page page-narrow">
      <p className="eyebrow">Game library</p>
      <h1>Lab Equipment ID</h1>
      {isTeacherPreview ? (
        <p className="discover-game-count">Teacher preview</p>
      ) : null}
      <section className="discover-game">
        <p className="discover-game-count">
          Score: {score}/{Math.min(round - (isRoundLocked ? 0 : 1), totalRounds)} | Round{" "}
          {Math.min(round, totalRounds)} of {totalRounds}
          {secondsLeft !== null ? ` | Time: ${formatTimer(secondsLeft)}` : null}
          {triesLabel ? ` | ${triesLabel}` : null}
        </p>
        {isGameComplete ? (
          <div className="discover-game-result">
            <strong>{timedOut ? "Time is up!" : "Game complete!"}</strong>
            <span>
              You scored {score}/{totalRounds}.
              {timedOut ? " The timer ended before you finished all questions." : ""}
              {isTeacherPreview
                ? " Restart to try another preview run."
                : attemptRecorded
                  ? " This run counts toward your try limit."
                  : ""}
            </span>
            {canPlayAgain ? (
              <button type="button" className="button" onClick={handleRestart}>
                Play again
              </button>
            ) : (
              <p className="discover-game-count">No tries remaining for this assignment.</p>
            )}
          </div>
        ) : (
          <>
            <p className="discover-game-prompt">{QUESTION_PROMPTS[question.style]}</p>
            <div className="discover-game-clues">
              {question.style === "name-to-image" ? (
                <div className="discover-game-clue discover-game-clue-name">
                  <strong>Equipment</strong>
                  <span>{question.card.name}</span>
                </div>
              ) : null}
              {question.style === "image-to-name" || question.style === "both-to-name" ? (
                <div className="discover-game-clue discover-game-clue-photo">
                  <strong>Photo clue</strong>
                  <div className="discover-game-clue-photo-frame">
                    <img
                      src={question.card.image}
                      alt=""
                      className="discover-game-clue-image"
                    />
                  </div>
                </div>
              ) : null}
              {question.style === "description-to-name" || question.style === "both-to-name" ? (
                <div className="discover-game-clue">
                  <strong>Purpose clue</strong>
                  <span>{question.card.purpose}</span>
                </div>
              ) : null}
            </div>
            {question.style === "name-to-image" ? (
              <div className="discover-game-options discover-game-options-images">
                {question.options.map((option) => {
                  const isPicked = selected === option.name;
                  const isAnswer = option.name === question.card.name;
                  let className = "discover-option discover-option-image";

                  if (isRoundLocked && isPicked && !isAnswer) {
                    className += " discover-option-wrong";
                  }

                  if (isRoundLocked && isAnswer) {
                    className += " discover-option-correct";
                  }

                  return (
                    <button
                      key={option.name}
                      type="button"
                      className={className}
                      onClick={() => handleAnswer(option.name)}
                      disabled={isRoundLocked}
                      aria-label={option.name}
                    >
                      <img
                        src={option.image}
                        alt=""
                        className="discover-option-image-thumb"
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="discover-game-options">
                {question.options.map((option) => {
                  const isPicked = selected === option;
                  const isAnswer = option === question.card.name;
                  let className = "discover-option";

                  if (isRoundLocked && isPicked && !isAnswer) {
                    className += " discover-option-wrong";
                  }

                  if (isRoundLocked && isAnswer) {
                    className += " discover-option-correct";
                  }

                  return (
                    <button
                      key={option}
                      type="button"
                      className={className}
                      onClick={() => handleAnswer(option)}
                      disabled={isRoundLocked}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
            {isRoundLocked ? (
              <div className={isCorrect ? "success" : "error"}>
                {isCorrect ? "Correct!" : `Not quite. The right answer is ${question.card.name}.`}
              </div>
            ) : null}
            <div className="actions-row">
              <button
                type="button"
                className="button"
                onClick={handleNext}
                disabled={!isRoundLocked}
              >
                Next question
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
