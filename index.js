const KEYBOARD_LAYOUT = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['↵', 'z','x','c','v','b','n','m', '←'],
];

const LS_GAME_DATA_KEY = 'LS_GAME_DATA';
const LS_RAW_USER_DATA_KEY = 'LS_RAW_USER_DATA';
const LS_SETTINGS_DATA_KEY = 'LS_SETTINGS_DATA';
const QUERYSTRING_SEED_KEY = 'seed';
const QUERYSTRING_CHALLENGER_SCORE_KEY = 'score';

const keyboardRoot = document.getElementById('keyboard');
const guessListRootElement = document.getElementById("guess_list_root");
const newGameButton = document.getElementById("new_game_button");
const challengeButton = document.getElementById("challenge_button");
const resetButton = document.getElementById('reset_all');
const modalContainer = document.getElementById('modal');
const modalCloseButton = document.getElementById('modal_close_button');
const gloatButton = document.getElementById('gloat_button');

/**
 * {
 *  charArray: ['','','','',''],
 *  scoreArray: [null, null, null, null, null],
 *  isCorrect: false
 * }
 */
let guesses;
let usedLetters;
let exactMatches;
let secret;
let isFinished;
let guessCount;
let hasWon = false;
let challengerScore;

// To be used for capturing multiple vectors of user input and for submitting new guesses.
let currentInput = '';

// In case we want to change the underlying logic.
const encodeSecretForSeeding = btoa;
const decodeSecretForSeeding = atob;

const wordCheck = (guess, secret) => {
  const guessList = guess.toLowerCase().split('');
  const secretList = secret.toLowerCase().split('');
  const result = new Array(5).fill(0);
  // TODO somehwere: guard against illegal input.
  // must be 5 chars
  // must be a-z
  // must be coerced to uppercase (or lower - whatever)
  // Need to make sure to account for duplicate letters.
  // Ie, if there are three llls in guess, and one l in the solution
  // only one l should show coloring. 

  // Pass 1: Exact matches
  for(let i = 0; i < guessList.length; i++){
    const guessChar = guessList[i];
    const compChar = secretList[i];
    if(guessChar === compChar){
      result[i] = 2;
      // To be used later for rendering keyboard keys correctly.
      exactMatches.add(guessChar);
      secretList[i] = null;
    }
  }

  // TODO: Check for success state.

  // Pass 2: Inexact matches
  for(let i = 0; i <guessList.length; i++){
    // Guard clause. We need to make sure we don't overwrite exact matches
    // with inexact matches. We can do this by skipping guess characters that already have
    // matched in the result.
    if(result[i] !== 0){
      continue;
    }
    const guessChar = guessList[i];
    const matchIndex = secretList.indexOf(guessChar);
    if(matchIndex !== -1){
      result[i] = 1;
      secretList[matchIndex] = null;
    }
  }

  return result;
}

const renderUsedLetters = () => {
  // Keyboard logic, if a letter has been found correctly at least once, even if only partial correct
  // in a separate instance in the same word, color correct. If only partial, color partial.
  const getKeyColor = char => {
    let color = '';
    if(usedLetters.has(char)){
      color = 'used';
      if(secret.includes(char)){
        color = 'half';
      }
    }
    if(exactMatches.has(char)){
      color = 'correct';
    }
    return color;
  };

  keyboardRoot.innerHTML = `
    ${
      KEYBOARD_LAYOUT.map(row => `
        <div class="keyboard-row">
          ${ 
            row.map(key => `
              <button class="keyboard-key ${getKeyColor(key)}" data-key="${key}">${key}</button>
            `).join('')
          }
        </div>
      `).join("")
    }
  `;
};

const renderGuessListRows = () => {
  // rather than iterating through and clearing all the updated attributes, if we create it from whole
  // cloth on each new game we save that effort and still obviate the issue with animations flickering on
  // each render update (because unlike React, we werent only updating nodes that changed, we were
  // rerendering the whole subtree)
  guessListRootElement.innerHTML = new Array(6).fill(null).map((_, i) => `
  <div class="guessWord" data-index="${i}">${
    new Array(5).fill(null).map(_ => `<span class="guessLetter"></span>`).join('')
  }</div>
`).join('');
}

const renderGuessListRowInput = (guessInput) => {
  const rowRootElement = guessListRootElement.querySelector(`div.guessWord[data-index="${guessCount}"]`)
  const tiles = Array.from(rowRootElement.querySelectorAll('span.guessLetter'));
  for(let i = 0; i < 5; i++){
    tiles[i].innerText = guessInput[i] ? guessInput[i] : '';
  }
} 

const renderGuessListRowScore = (guess) => {
  const rowRootElement = guessListRootElement.querySelector(`div.guessWord[data-index="${guessCount}"]`)
  const tiles = Array.from(rowRootElement.querySelectorAll('span.guessLetter'));
  for(let i = 0; i < 5; i++){
    let scoreClass;
    if(guess.scoreArray[i] === 0){
      scoreClass = 'none';
    }
    else if (guess.scoreArray[i] === 1){
      scoreClass = 'half';
    }
    else {
      scoreClass = 'full';
    }
    tiles[i].classList.add('guessed');
    tiles[i].classList.add(scoreClass);
  }
}

const renderRecentlySeenWordsList = () => {
  const pastWords = getHistoricalGameData();
  const recentWordsListRoot = document.getElementById('recent_words_list_root');
  if(!pastWords || !pastWords.length){
    recentWordsListRoot.innerHTML = '';
    return;
  }
  recentWordsListRoot.innerHTML = pastWords.slice(0, 10).map((word) => `<li class="recentWord">${word}</li>`).join('');
}

const submitNewGuess = newGuessWord => {
  if(isFinished){
    return;
  }
  const isValidWord = SECRET_WORD_LIST.includes(newGuessWord.toLowerCase()) || ACCEPTABLE_WORD_LIST.includes(newGuessWord.toLowerCase());
  if(!isValidWord){
    console.log('Invalid word')
  }
  else {
    newGuessWord.split('').forEach(el => {
      usedLetters.add(el.toLowerCase());
    })
    const guessResult = wordCheck(newGuessWord, secret);
    const guessObject = {
      charArray: newGuessWord.split(''),
      scoreArray: guessResult,
      isCorrect: guessResult.every(res => res === 2)
    };
    guesses.push(guessObject);
    renderGuessListRowScore(guessObject);
    guessCount++;
    currentInput = '';
    if(guessObject.isCorrect || guessCount > 5){
      gameOver();
      // e.target.elements.guess.disabled = true;
      if(guessObject.isCorrect){
        hasWon = true;
        document.body.dataset.gamestate = "success";
      }
      else {
        hasWon = false;
        document.body.dataset.gamestate = "failure";
      }
    }
  }
  refresh();
}

const guessInputUpdateListener = e =>  {
  const key = e.detail;
  if(key === 'Enter' || key === '↵'){
    if(isFinished){
      // TODO: Broadcast message instead of simulating click;
      newGameButton.click();
      return;
    }
    if(currentInput.length === 5){
      submitNewGuess(currentInput);
      // return to avoid hacky way of updating user input live.
      return;
    }
    else {
      console.log("word too short to submit");
    }
  }
  else {
    if(key === 'Backspace' || key === '←'){
      if(currentInput.length){
        currentInput = currentInput.slice(0, -1);
      }
    }
    else {
      if(currentInput.length < 5){
        currentInput = currentInput.concat(key);
      }
      else {
        currentInput = currentInput.slice(0, -1).concat(key);
      }
    }
    renderGuessListRowInput(currentInput);
  }
}

const keypressListener = e => {
  if(e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target.nodeName === 'BUTTON'){
    return;
  }
  if(e.key === 'Enter' || e.key === '↵'){
    document.dispatchEvent(new CustomEvent("guess-input-update", { detail: 'Enter' }))
  }
  if(e.key === 'Backspace' || e.key === '←'){
    document.dispatchEvent(new CustomEvent("guess-input-update", { detail: 'Backspace' }))
  }
  if('abcdefghijklmnopqrstuvwxyz'.includes(e.key.toLowerCase())){
    document.dispatchEvent(new CustomEvent("guess-input-update", { detail: e.key.toLowerCase() }))
  }
}

const touchListener =  e => {
  const button = e.target.closest("button");
  if(button){
    const key = button.dataset.key;
    if('abcdefghijklmnopqrstuvwxyz↵←'.includes(key)){
      document.dispatchEvent(new CustomEvent("guess-input-update", { detail: key }))
    }
  }
  return false;
}

// TODO: Make static html as well
const refresh = () => {
  renderUsedLetters();
}

const getHistoricalGameData = () => {
  const localStorageValue = localStorage.getItem(LS_GAME_DATA_KEY);
  if(!localStorageValue){
    return;
  }
  // TODO: Should it just be an array of used words? Is there anything else worth persisting between games
  // for creating the next game state?
  // For now, no.
  const usedWords = JSON.parse(localStorageValue);
  return usedWords;
}

const updateHistoricalGameData = (usedWord) => {
  const existingWordList = getHistoricalGameData();
  const updatedGameData = existingWordList ? [usedWord, ...existingWordList ] : [ usedWord ];
  localStorage.setItem(LS_GAME_DATA_KEY, JSON.stringify(updatedGameData));
}

const readHistoricalRawUserData = () => {
  // We also will want to read settings 
  const localStorageValue = localStorage.getItem(LS_RAW_USER_DATA_KEY);
  if(!localStorageValue){
    return;
  }
  const existingUserData = JSON.parse(localStorageValue);
  return existingUserData;
}

const updateHistoricalRawUserData = (gameData) => {
  // NOTE: We won't update user data except on completion of a game.
  const existingRawUserData = readHistoricalRawUserData() || [];
  existingRawUserData.push({
    gameData,
    secret,
    won: gameData[gameData.length - 1].isCorrect,
    timestamp: Date.now()
  });
  localStorage.setItem(LS_RAW_USER_DATA_KEY, JSON.stringify(existingRawUserData));
}

const startChallengeMode = (score) => {
  if(score){
    // TODO: Do we need the global?
    challengerScore = score;
    const wordTiles = Array.from(guessListRootElement.querySelectorAll('.guessLetter'));
    for(let i = 0; i < score.length; i++){
      const tileScore = score[i];
      wordTiles[i].dataset.challenger_score = tileScore;
    }
  }
}

const teardownChallengeMode = () => {
  if(challengerScore){
    challengerScore = null;
    const wordTiles = Array.from(guessListRootElement.querySelectorAll('.guessLetter'));
    wordTiles.forEach(tile => { tile.dataset.challenger_score = undefined; });
  }
}

//TODO: Definitely getting unDRY here. But want to implement before cleaning up.
// TODO: Maybe allow for either \n or <br/>
const generateGraphicFromScoreString = scoreString => {
  const colors = ['⬛','🟨','🟩'];
  const transformedArray = scoreString.split('').map(str => colors[parseInt(str)]);
  let chunkedArray = [];
  for(let i = 0; i < transformedArray.length; i+= 5){
    chunkedArray = [ ...chunkedArray, ...transformedArray.slice(i, i + 5), '<br/>']
  }
  return chunkedArray.join("");
}

const generateGraphicalScore = (guesses) => {
  const colors = ['⬛','🟨','🟩'];
  const graphic = guesses.reduce((acc, curr) => {
    const row  = curr.scoreArray.map(score => colors[score]).join('');
    return `${acc}${row}\n`
  }, '')
  return graphic;
}

const generateScoreString = (guesses) => {
  return guesses.reduce((acc, curr) => {
    const row  = curr.scoreArray.map(score => score).join('');
    return `${acc}${row}`
  }, '')
}

const shareChallengeLink = () => {
  const seed = encodeSecretForSeeding(secret);
  const scoreCard = generateScoreString(guesses);
  const challengeURL = `${window.location.origin}/${window.location.pathname}?seed=${seed}&score=${scoreCard}`;
  const resultGraphic = generateGraphicalScore(guesses);
  let shareObject;
  if(hasWon === true) {
    shareObject = {
      title: 'Can you beat my score on Yordle?',
      text: 'Can you beat my score on Yordle?\n\n' + resultGraphic + '\n' + challengeURL,
      url: challengeURL
    }
  }
  else {
    shareObject = {
      title: 'Can you succeed where I failed on Yordle?',
      text: 'Can you succeed where I failed on Yordle?\n\n' + resultGraphic + '\n' + challengeURL + '\n',
      url: challengeURL
    }
  } 
  if(navigator.share){
    navigator.share(shareObject);
  }
  else {
    // TODO:
    // uhhh, all the other stuff. At least a basic link with seed
  }

}

const renderGloatScreen = () => {
  const myScore = generateScoreString(guesses);
  // TODO: this should only happen when state isFinished and !!challengerScore
  const challengerTries = challengerScore.length / 5;
  const myTries = myScore.length / 5;
  const challengerFoundWord = challengerScore.slice(-5) === '22222';
  const IFoundWord = myScore.slice(-5) === '22222';
  let result;
  if(challengerFoundWord && IFoundWord){
    if(challengerTries < myTries){
      result = 'failure';
    }
    else if(myTries < challengerTries){
      result = 'success';
    }
    else {
      result = 'draw';
    }
  }
  else if(challengerFoundWord){
    result = 'failure';
  }
  else if(IFoundWord){
    result = 'success';
  }
  else {
    result = 'draw';
  }
  // TODO: Add little images of people, happy, sad, bored.
  const gloatContainer = document.getElementById('gloat_container');
  gloatContainer.dataset.result = result;
  const innerHTML = `
    <h1>${ 
      result === 'success'
        ? 'I Win!'
        : result === 'draw'
          ? 'We Tied'
          : 'I Lose!'
     }</h1>
    <div class="gloat-result-container ${ result }">
      <div class="gloat-result-text">
        <h2>Challenger</h2>
        <div class="gloat-result-graphic">${ result === 'failure' ? `🏆` : ''}</div>
      </div>
      <div class="gloat-score-graphic">
        <p>
        ${ generateGraphicFromScoreString(challengerScore) }
        </p>
      </div>
    </div>
    <div class="gloat-result-container">
      <div class="gloat-result-text">
        <h2>Me</h2>
        <div class="gloat-result-graphic">${ result === 'success' ? '🏆' : ''}</div>
      </div>
      <div class="gloat-score-graphic">
        <p>
        ${ generateGraphicFromScoreString(myScore) }
        </p>
      </div>
    </div>
    <button id="gloat-share-button">Share Challenge Results</button>
  `
  gloatContainer.innerHTML = innerHTML;
}

const generateNewSecret = (seed) => {
  let secret;
  if(seed){
    return decodeSecretForSeeding(seed);
  }
  const allPossibleWords = new Set(SECRET_WORD_LIST);
  const usedWords = getHistoricalGameData() || [];
  // If there are still remaining words to choose from, Filter out used words and choose.
  if(usedWords.length < allPossibleWords.size){
    usedWords.forEach(word => allPossibleWords.delete(word));
    const remainingWords = Array.from(allPossibleWords)
    secret = remainingWords[Math.floor(Math.random() * remainingWords.length)];
  }
  // Otherwise, reset the used words in localStorage 
  // TODO: keep a separate list of the last ten so that that feature doesn't go away? 
  else {
    localStorage.removeItem(LS_GAME_DATA_KEY);
    secret = SECRET_WORD_LIST[Math.floor(Math.random() * SECRET_WORD_LIST.length)];
  }
  return secret
}

const newGame = (seed, challengerScore) => {
  // TODO: Move all visual gamestate clearing into function?
  document.body.dataset.gamestate = undefined;
  challengeButton.disabled = true;
  guesses = [];
  usedLetters = new Set();
  exactMatches = new Set();
  isFinished = false;
  hasWon = false;
  guessCount = 0;
  secret = generateNewSecret(seed);
  // TODO: Load saved preferences for theme
  renderGuessListRows();
  teardownChallengeMode();
  startChallengeMode(challengerScore);
  renderRecentlySeenWordsList();
  refresh();
  console.debug(secret)
}

const onLoad = ()=> {
  document.addEventListener("guess-input-update", guessInputUpdateListener);
  document.addEventListener('keyup', keypressListener);
  keyboardRoot.addEventListener("click", touchListener);
  newGameButton.addEventListener('click', () => newGame())
  resetButton.addEventListener('click', () => localStorage.clear());
  challengeButton.addEventListener('click', () => {
    if(isFinished){
      shareChallengeLink();
    }
  })
  gloatButton.addEventListener('click', () => {
    if(!isFinished || !challengerScore){
      return;
    }
    // TODO: Reuse challenge button for gloating when in challengeMode
    document.documentElement.dataset.modal = true;
    modal.dataset.type = "gloat";
    renderGloatScreen();
  })
  modalCloseButton.addEventListener('click', () => {
    document.documentElement.dataset.modal = false;
  })
  // We read for a possible seed here instead of in new game.
  // Saves us having to update the querystring to remove the seed later without
  // getting stuck playing the same word.
  const searchParams = new URLSearchParams(window.location.search);
  const seed = searchParams.get(QUERYSTRING_SEED_KEY);
  challengerScore = searchParams.get(QUERYSTRING_CHALLENGER_SCORE_KEY);
  // Decided to remove querystring after all. Gets rid of confusing discrepency in behavior
  // between refresh and new game button.
  history.pushState(null, "", window.location.href.split("?")[0]);
  newGame(seed, challengerScore);
}

const gameOver = () => {
  isFinished = true;
  challengeButton.disabled = false;
  updateHistoricalGameData(secret);
  updateHistoricalRawUserData(guesses);
}

onLoad();

// 134 from skin dc

// TODO:
// Add statistics (favorite words, favorite letters, most common solution letters)

// ++ Add local storage for used words
// ++ Create a reset button (purge local storage)
// ++ Show last 10 seen words
// ++ Add new game button
// ++ Store all game results in local storage
// ++ Add enter and backspace buttons.
// ++ Restore touch logic
// ++ Make mobile friendly
// ++ Host somewhere (github pages)
// ++ Create seeding and allow sharing by seed (override used list when using seed) with a visual and "Can you beat my score?"
// ++ BUG concatenating whole url again
// ++ Show challenger score
// Show challenge success
// Allow setting name for sharing
// Add gloat feature
// Restore focus to window after interacting with button
// Add butter bar for validation error messages
// Reveal correct word on failure
// Move all styles to variables.
// Add restyling options
// Store style preferences in local storage
// Create statistics
// - Favorite first word
// - Favorite words
// - Graph of previous wins
// ...
// Move statistics into modal
// Improve victory and defeat animations
// add pwa support for iphone
// Link to original