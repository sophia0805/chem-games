import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useGamePlayConfig } from "../context/GamePlayContext";
import {
  clearTeacherPreviewProgress,
  isValidSavedProgress,
  loadTeacherPreviewProgress,
  saveTeacherPreviewProgress,
  type SavedLabEquipmentProgress,
  type SavedLabEquipmentQuestion,
  type SavedQuestionStyle,
} from "../games/labEquipmentProgress";
import { formatTimer } from "../games/settings";
import { recordGameAttempt } from "../lib/gameAccess";
import {
  clearServerGameProgress,
  loadServerGameProgress,
  saveServerGameProgress,
} from "../lib/gameProgress";

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

type QuestionStyle = SavedQuestionStyle;

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

function serializeQuestion(question: Question): SavedLabEquipmentQuestion {
  if (question.style === "name-to-image") {
    return {
      cardName: question.card.name,
      style: question.style,
      optionNames: question.options.map((option) => option.name),
    };
  }

  return {
    cardName: question.card.name,
    style: question.style,
    optionNames: question.options,
  };
}

function deserializeQuestion(saved: SavedLabEquipmentQuestion): Question | null {
  const card = labEquipmentGame.find((item) => item.name === saved.cardName);
  if (!card) {
    return null;
  }

  if (saved.style === "name-to-image") {
    const options = saved.optionNames
      .map((name) => labEquipmentGame.find((item) => item.name === name))
      .filter((item): item is EquipmentCard => Boolean(item));
    if (options.length !== saved.optionNames.length) {
      return null;
    }
    return { card, style: saved.style, options };
  }

  return {
    card,
    style: saved.style,
    options: saved.optionNames,
  };
}

type GameRunState = {
  usedNames: string[];
  score: number;
  round: number;
  selected: string | null;
  isCorrect: boolean | null;
  timedOut: boolean;
  secondsLeft: number | null;
  question: Question;
};

function createFreshRun(timerLimitSeconds: number | null): GameRunState {
  return {
    usedNames: [],
    score: 0,
    round: 1,
    selected: null,
    isCorrect: null,
    timedOut: false,
    secondsLeft: timerLimitSeconds,
    question: getQuestion([]),
  };
}

function restoreRun(
  saved: SavedLabEquipmentProgress,
  timerLimitSeconds: number | null
): { state: GameRunState; resumed: boolean } {
  const question = deserializeQuestion(saved.question);
  if (!question) {
    return { state: createFreshRun(timerLimitSeconds), resumed: false };
  }

  return {
    resumed: true,
    state: {
      usedNames: saved.usedNames,
      score: saved.score,
      round: saved.round,
      selected: saved.selected,
      isCorrect: saved.isCorrect,
      timedOut: saved.timedOut,
      secondsLeft:
        timerLimitSeconds === null ? null : (saved.secondsLeft ?? timerLimitSeconds),
      question,
    },
  };
}

function buildSavedProgress(
  state: GameRunState,
  totalRounds: number,
  timerLimitSeconds: number | null
): SavedLabEquipmentProgress {
  return {
    version: 1,
    totalRounds,
    timerLimitSeconds,
    usedNames: state.usedNames,
    score: state.score,
    round: state.round,
    selected: state.selected,
    isCorrect: state.isCorrect,
    timedOut: state.timedOut,
    secondsLeft: state.secondsLeft,
    question: serializeQuestion(state.question),
  };
}

export default function LabEquipmentGame() {
  const { user } = useAuth();
  const { settings, attemptsUsed, isTeacherPreview, classId, assignmentId, assignmentTitle } =
    useGamePlayConfig();
  const totalRounds = settings.questionCount;
  const timerLimitSeconds = settings.timerLimitSeconds;

  const [progressLoading, setProgressLoading] = useState(
    () => !isTeacherPreview && Boolean(user && assignmentId)
  );
  const [runState, setRunState] = useState<GameRunState>(() => createFreshRun(timerLimitSeconds));
  const [resumedSession, setResumedSession] = useState(false);
  const [attemptRecorded, setAttemptRecorded] = useState(false);

  const attemptRecordedRef = useRef(false);
  const runStateRef = useRef(runState);
  const isGameCompleteRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

  runStateRef.current = runState;

  const {
    usedNames,
    score,
    round,
    selected,
    isCorrect,
    timedOut,
    secondsLeft,
    question,
  } = runState;

  const isRoundLocked = selected !== null;
  const isGameComplete = round > totalRounds || timedOut;
  isGameCompleteRef.current = isGameComplete;

  useEffect(() => {
    let cancelled = false;

    const loadProgress = async () => {
      if (isTeacherPreview) {
        const saved = loadTeacherPreviewProgress();
        if (
          saved &&
          isValidSavedProgress(saved, totalRounds, timerLimitSeconds) &&
          deserializeQuestion(saved.question)
        ) {
          const restored = restoreRun(saved, timerLimitSeconds);
          setRunState(restored.state);
          setResumedSession(restored.resumed);
        }
        setProgressLoading(false);
        return;
      }

      if (!user || !assignmentId) {
        setProgressLoading(false);
        return;
      }

      try {
        const saved = await loadServerGameProgress(user.id, assignmentId);
        if (cancelled) {
          return;
        }

        if (
          saved &&
          isValidSavedProgress(saved, totalRounds, timerLimitSeconds) &&
          deserializeQuestion(saved.question)
        ) {
          const restored = restoreRun(saved, timerLimitSeconds);
          setRunState(restored.state);
          setResumedSession(restored.resumed);
        }
      } catch {
        // Start fresh if the server save cannot be loaded.
      } finally {
        if (!cancelled) {
          setProgressLoading(false);
        }
      }
    };

    void loadProgress();

    return () => {
      cancelled = true;
    };
  }, [user, assignmentId, isTeacherPreview, totalRounds, timerLimitSeconds]);

  const persistProgress = useCallback(
    async (state: GameRunState) => {
      const progress = buildSavedProgress(state, totalRounds, timerLimitSeconds);

      if (isTeacherPreview) {
        saveTeacherPreviewProgress(progress);
        return;
      }

      if (!user || !assignmentId) {
        return;
      }

      await saveServerGameProgress({
        userId: user.id,
        assignmentId,
        gameId: "lab-equipment",
        classId,
        progress,
      });
    },
    [user, assignmentId, classId, isTeacherPreview, totalRounds, timerLimitSeconds]
  );

  const clearProgress = useCallback(async () => {
    if (isTeacherPreview) {
      clearTeacherPreviewProgress();
      return;
    }

    if (!user || !assignmentId) {
      return;
    }

    await clearServerGameProgress(user.id, assignmentId);
  }, [user, assignmentId, isTeacherPreview]);

  const updateRunState = useCallback((patch: Partial<GameRunState>) => {
    setRunState((prev) => ({ ...prev, ...patch }));
  }, []);

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
        assignmentId,
        score,
        questionCount: totalRounds,
      });
    } catch {
      // Attempt tracking is optional if the table is missing.
    }
  }, [user, isTeacherPreview, classId, assignmentId, score, totalRounds]);

  useEffect(() => {
    if (!isGameComplete) {
      return;
    }
    void clearProgress();
    void recordAttempt();
  }, [isGameComplete, recordAttempt, clearProgress]);

  useEffect(() => {
    if (isGameComplete || progressLoading) {
      return;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void persistProgress(runStateRef.current);
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [runState, isGameComplete, progressLoading, persistProgress]);

  useEffect(() => {
    return () => {
      if (isGameCompleteRef.current || progressLoading) {
        return;
      }
      void persistProgress(runStateRef.current);
    };
  }, [persistProgress, progressLoading]);

  useEffect(() => {
    if (timerLimitSeconds === null || isGameComplete) {
      return;
    }

    const interval = window.setInterval(() => {
      setRunState((prev) => {
        if (prev.secondsLeft === null || prev.secondsLeft <= 1) {
          return { ...prev, secondsLeft: 0, timedOut: true };
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [timerLimitSeconds, isGameComplete]);

  const handleAnswer = (choice: string) => {
    if (isRoundLocked || isGameComplete) {
      return;
    }

    const answerCorrect = choice === question.card.name;
    updateRunState({
      selected: choice,
      isCorrect: answerCorrect,
      score: answerCorrect ? score + 1 : score,
    });
  };

  const handleNext = () => {
    if (!isRoundLocked || isGameComplete) {
      return;
    }

    const nextUsedNames = [...usedNames, question.card.name];
    updateRunState({
      usedNames: nextUsedNames,
      selected: null,
      isCorrect: null,
      round: round + 1,
      question: getQuestion(nextUsedNames),
    });
  };

  const handleRestart = () => {
    attemptRecordedRef.current = false;
    setAttemptRecorded(false);
    setResumedSession(false);
    void clearProgress();
    setRunState(createFreshRun(timerLimitSeconds));
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

  if (progressLoading) {
    return (
      <main className="page page-narrow">
        <p>Loading your saved game...</p>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <p className="eyebrow">Game library</p>
      <h1>{assignmentTitle && !isTeacherPreview ? assignmentTitle : "Lab Equipment ID"}</h1>
      {isTeacherPreview ? (
        <p className="discover-game-count">Teacher preview</p>
      ) : null}
      {resumedSession && !isGameComplete ? (
        <p className="discover-game-count">Continuing where you left off.</p>
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
