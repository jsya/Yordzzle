const VERSION = 0.1;
const KEYBOARD_LAYOUT = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['↵', 'z','x','c','v','b','n','m', '←'],
];

const SS_GAME_STATE_BACKUP_KEY = 'SS_GAME_STATE_BACKUP';
const LS_GAME_DATA_KEY = 'LS_GAME_DATA';
const LS_RAW_USER_DATA_KEY = 'LS_RAW_USER_DATA';
const LS_SETTINGS_DATA_KEY = 'LS_SETTINGS_DATA';
const QUERYSTRING_CHALLENGE_KEY = 'challenge';

const keyboardRoot = document.getElementById('keyboard');
const guessListRootElement = document.getElementById("guess_list_root");
const newGameButton = document.getElementById("new_game_button");
const challengeButton = document.getElementById("challenge_button");
const resetButton = document.getElementById('reset_all');
const modalContainer = document.getElementById('modal');
const modalCloseButton = document.getElementById('modal_close_button');
const gloatContainer = document.getElementById('gloat_container');

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
let guessCount = 0;
let isFinished = false;
let hasWon = false;
let challengeData;
let inputDisabled = false;

// To be used for capturing multiple vectors of user input and for submitting new guesses.
let currentInput = [];
let isCurrentInputValid = false;
let activeAnimationQueue = new Set();
/**
 * UTILITIES
 */

// In case we want to change the underlying logic.
const encodeString = btoa;
const decodeString = atob;

// Until I have a gamestate object this will help logging (without using debugger)
const logState = () => {
  console.debug({
    currentInput,
    isCurrentInputValid,
    guesses,
    usedLetters,
    exactMatches,
    secret,
    guessCount,
    isFinished,
    hasWon,
    inputDisabled,
  })
}

// TODO: Allow for function overloading for string or arrays for both
const wordCheck = (guess, secret) => {
  const guessList = guess.toLowerCase().split('');
  const secretList = secret.toLowerCase().split('');
  const result = new Array(5).fill(0);
  // TODO somehwere: guard against illegal input.
  // must be 5 chars
  // must be a-z
  // must be coerced to uppercase (or lower - whatever)

  // Pass 1: Exact matches
  for(let i = 0; i < guessList.length; i++){
    const guessChar = guessList[i];
    const compChar = secretList[i];
    if(guessChar === compChar){
      result[i] = 2;
      secretList[i] = null;
    }
  }

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

// TODO: Handle versioning
const processRawChallengerData = (encryptedParam) => {
  /**
 *  Raw:
 *  (Will be a stringified json that is then encrypted and a querystring param value)
 * {
 *  n: 'Brendan' // Name,
 *  s: 'manic', // Secret
 *  c: 'peonypanicmanic', // Results 
 *  v: '1' // Api version
 * }
 * Additional Processing:
 * {
 *  charArray: ['p', 'e', 'o', 'n', 'y', 'p', 'a', 'n', 'i', 'c', 'm', 'a', 'n', 'i', 'c'],
 *  scoreArray: [0,0,2,0,0,1,1,0,1,1,2,2,2,2,2]' // ScoreArray
 * }
 */
  // Decrypt, parse, then process
  const decryptedRawData = decodeString(encryptedParam);
  if(!decryptedRawData){
    // To avoid JSON.parse throwing on null.
    return;
  }
  const parsedRawData = JSON.parse(decryptedRawData);
  let processedData = {}
  processedData.name = parsedRawData.n || 'Challenger';
  processedData.secret = parsedRawData.s;
  // TODO: Flat or 1 deep array?
  processedData.charArray = parsedRawData.c.split('');
  // TODO: Looping through flat letters array to pass full words to wordCheck is happening all over and
  // should be consolidated or obviated. This is the last time I will write this again, expect to refactor soon.
  // NOTE: If anything in life is true, the above statement will be ignored for way too long.
  processedData.scoreArray = [];
  for(let i = 0; i < processedData.charArray.length; i += 5){
    const guess = processedData.charArray.slice(i, i + 5).join(''); // NOTE: wordCheck expects words, not arrays
    processedData.scoreArray = [ ...processedData.scoreArray, ...wordCheck(guess, processedData.secret)]
  }
  // SHIT!! NEED to update wordcheck to avoid conflicting with exactMatches set so that challenger data doesn't
  // corrupt keyboard
  return processedData;
}

const generateChallengerDataString = () => {
  // TODO: Would be nice to stop having all this stuff use global state values. Or at least keep them in a
  // store that I could dump straight into a JSON.
  const rawData = {
    // TODO: Institute names :)
    // n: 'Brendan',
    v: VERSION,
    s: secret,
    // TODO: Ok, I said last time would be the last time I write chunking and unchunking logic again. Clearly, the
    // underlying data needs to be restructured. But, ugh, its late and the great british baking show is hitting
    // the semi-finals and need brain use to power the heavy eye-rolls needed for host jokes during time updates.
    c: guesses.map(guess => guess.charArray).flat().join('')
  }
  const stringifiedData = JSON.stringify(rawData)
  const encodedString = encodeString(stringifiedData)
  return encodedString;
}

// TODO: This is a good argument for keeping game state in a single object/store. Easier to serialize, deserialize
// For now I'm going to have to add and update all values by name.
// I'll start moving that way by at least sharing an object with all the necessary properties
// TODO: Saving an in progress challenge will be trickier with the querystring.
const clearGameStateBackup = () => {
  sessionStorage.removeItem(SS_GAME_STATE_BACKUP_KEY);
}

const backupGameState = () => {
  const gameState = {
    currentInput,
    guesses,
    usedLetters: Array.from(usedLetters),
    exactMatches: Array.from(exactMatches),
    hasWon,
    guessCount,
    secret
  }
  sessionStorage.setItem(SS_GAME_STATE_BACKUP_KEY, JSON.stringify(gameState));
}

const restoreGameState = (challengeData) => {
  let backupGameState = {};
  const backupGameStateString = sessionStorage.getItem(SS_GAME_STATE_BACKUP_KEY);
  if(backupGameStateString){
    backupGameState = JSON.parse(backupGameStateString);
  }
  // currentInput = '';
  guesses = backupGameState?.guesses ?? [];
  usedLetters = new Set(backupGameState?.usedLetters ?? []);
  exactMatches = new Set(backupGameState?.exactMatches ?? []);
  hasWon = backupGameState?.hasWon ?? false;
  guessCount = backupGameState?.guessCount ?? 0;
  // TODO CHALLENGE DATA
  secret = backupGameState?.secret ?? (challengeData?.secret || generateNewSecret());
  updateCurrentInput(backupGameState?.currentInput || []);

  // Return whether restoring from a backup or not;
  return !!backupGameStateString;
}

/**
 * RENDERING
 */

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

const updateKeyboardKeyState = (keyChar, classes = []) => {
  const key = keyboardRoot.querySelector(`button[data-key="${keyChar}"]`);
  if(key && classes.length){
    const eventListener = () => {
      for(let i = 0; i < classes.length; i++){
        key.classList.remove(classes[i]);
      }
      key.removeEventListener('animationend', eventListener);
    }
    for(let i = 0; i < classes.length; i++){
      key.classList.add(classes[i]);
    }
    key.addEventListener('animationend', eventListener)
  }
}

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

const renderGuessListRowInput = (guessInput, rowIndex) => {
  // We only want to color input as invalid when it's five letters
  // TODO: Have function return tile nodes so logic like this can be moved out?
  const isValid = guessInput.length !== 5 || determineIsValidGuess(guessInput);
  const rowRootElement = guessListRootElement.querySelector(`div.guessWord[data-index="${rowIndex}"]`)
  if(!rowRootElement){
    // We should not be looking for rows not in the DOM.
    throw new Error('Cannot find row root element for index ' + rowIndex);
  }
  rowRootElement.dataset.valid = isValid;
  const tiles = Array.from(rowRootElement.querySelectorAll('span.guessLetter'));
  for(let i = 0; i < 5; i++){
    tiles[i].innerText = guessInput[i] ? guessInput[i] : '';
  }
} 

const renderGuessListRowScore = (guess, rowIndex) => {
  const rowRootElement = guessListRootElement.querySelector(`div.guessWord[data-index="${rowIndex}"]`)
  const tiles = Array.from(rowRootElement.querySelectorAll('span.guessLetter'));
  const promises = [];
  // Make foreach.
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
    promises.push(new Promise((res) => {
      tiles[i].addEventListener('animationend', () => {
        res()
      })
    }))
    tiles[i].classList.add('guessed');
    tiles[i].classList.add(scoreClass);
  }
  return Promise.all(promises);
}

// NOTE: Don't need tp remove since the entire root element is getting blown out on new game.
const renderSecretReveal = (secret) => {
  const row = document.createElement('div');
  row.classList.add('guessWord');
  row.id = 'secret_reveal_row';
  row.innerHTML = secret.split('').map(char => `<span class="guessLetter">${char}</span>`).join('')
  guessListRootElement.appendChild(row);
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

const determineIsValidGuess = (guessArr) => {
  // TODO: Handle string or array
  const guessStr = guessArr.join('');
  return SECRET_WORD_LIST.includes(guessStr.toLowerCase()) || ACCEPTABLE_WORD_LIST.includes(guessStr.toLowerCase());
}


const submitNewGuess = async (newGuessWord) => {
  if(isFinished){
    return;
  }
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
  guessObject.scoreArray.forEach((score, i) => {
    if(score === 2){
      exactMatches.add(guessObject.charArray[i]);
    }
  })
  // TODO: Disable keylistener and keyboard 
  // Set a flag for the listener
  // TODO visually disable keyboard
  inputDisabled = true;
  await renderGuessListRowScore(guessObject, guessCount);
  guessCount++;
  inputDisabled = false;
  if(guessObject.isCorrect || guessCount > 5){
    gameOver();
    // e.target.elements.guess.disabled = true;
    if(guessObject.isCorrect){
      hasWon = true;
      document.body.dataset.gamestate = "success";
    }
    else {
      hasWon = false;
      renderSecretReveal(secret);
      document.body.dataset.gamestate = "failure";
    }
  }
  else {
    updateCurrentInput([]);
    backupGameState();
  }
  refresh();
}

const updateCurrentInput = (inputArray) => {
  if(!inputArray){
    throw new Error('updateCurrentInput requires a string array as parameter')
  }
  // Besides adding or removing chars to the input string, we can use this opportunity to
  // determine whether a word is valid (when 5 chars long) and if so, conditionally change color and
  // disable submit button.

  // CLEAR
  currentInput = inputArray;
  if(currentInput.length === 5){
    // TODO Check word and determine if word is false
    isCurrentInputValid = determineIsValidGuess(currentInput);
  }
  else {
    isCurrentInputValid = false;
  }
  renderGuessListRowInput(currentInput, guessCount);
}

const guessInputUpdateListener = e =>  {
  if(inputDisabled){
    return;
  }
  const key = e.detail;
  updateKeyboardKeyState(key, ['tapped'])
  if(key === 'Enter' || key === '↵'){
    if(isFinished){
      // TODO: Broadcast message instead of simulating click;
      newGameButton.click();
      return;
    }
    if(isCurrentInputValid){
      submitNewGuess(currentInput.join(''));
      // return to avoid hacky way of updating user input live.
      return;
    }
    else {
      if(currentInput.length === 5){
        console.log("invalid word")
      }
      else {
        console.log("word too short to submit");
      }
    }
  }
  else {
    if(isFinished){
      // Don't allow making guesses after game is over.
      return;
    }
    if(key === 'Backspace' || key === '←'){
      if(currentInput.length){
        updateCurrentInput(currentInput.slice(0, -1));
      }
    }
    else {
      if(currentInput.length < 5){
        updateCurrentInput([...currentInput, key ]);
      }
      else {
        updateCurrentInput([...currentInput.slice(0, -1), key]);
      }
    }
  }
}

const keypressListener = e => {
  if(e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target.nodeName === 'BUTTON'){
    return;
  }
  if(e.key === 'Enter' || e.key === '↵'){
    document.dispatchEvent(new CustomEvent("guess-input-update", { detail: '↵' }))
  }
  if(e.key === 'Backspace' || e.key === '←'){
    document.dispatchEvent(new CustomEvent("guess-input-update", { detail: '←' }))
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
      document.dispatchEvent(new CustomEvent("guess-input-update", { detail: key }));
      // Remove focus from button to prevent issues with lingering focus/highlighting on some devices.
      button.blur();
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
  const updatedGameData = existingWordList ? Array.from(new Set([usedWord, ...existingWordList ])) : [ usedWord ];
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

const startChallengeMode = (data) => {
  if(data){
    challengeData = data;
    const wordTiles = Array.from(guessListRootElement.querySelectorAll('.guessLetter'));
    for(let i = 0; i < challengeData.scoreArray.length; i++){
      const tileScore = challengeData.scoreArray[i];
      wordTiles[i].dataset.challenger_score = tileScore;
    }
  }
}

const teardownChallengeMode = () => {
  if(challengeData){
    challengeData = null;
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
const generateGraphicFromScoreArray = scoreArray => {
  const colors = ['⬛','🟨','🟩'];
  const transformedArray = scoreArray.map(score => colors[score]);
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

const generateCharString = (guesses) => {
  return guesses.reduce((acc, curr) => {
    const row  = curr.charArray.map(score => score).join('');
    return `${acc}${row}`
  }, '')
};

const shareChallengeLink = () => {
  const scoreCard = generateChallengerDataString();
  const challengeURL = `${window.location.origin}${window.location.pathname}?${QUERYSTRING_CHALLENGE_KEY}=${scoreCard}`;
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

const renderFullResultsPreview = (charArray, scoreArray) => {
  const renderResultsRows = () => {
    let html = '';
    for(let i = 0; i < charArray.length; i+=5){
      html = html.concat(`
        <div class="result-row">
          ${ charArray.slice(i, i +5).map((char, j) => `<span class="result-tile ${
            scoreArray[i + j] === 2 ? 'full' 
              : scoreArray[i + j] === 1 ? 'half'
                : ''
          }">${char}</span>`).join('')}
        </div>
      `)
    }
    return html;
  }
  let html = `
    <div class="gloat-result-graphic">${renderResultsRows(charArray, scoreArray)}</div>
  `;
  return html;
}

const renderChallengeResultsScreen = () => {
  const myScoreArray = guesses.reduce((acc, curr) => {
    return [...acc, ...curr.scoreArray]
  }, []);
  // REFACTOR: stop all this conversion everywhere
  const myCharArray = guesses.reduce((acc, curr) => {
    return [...acc, ...curr.charArray]
  }, []);
  const challengerTries = challengeData.scoreArray.length / 5;
  const myTries = myScoreArray.length / 5;
  const challengerFoundWord = challengeData.scoreArray.slice(challengeData.scoreArray.length -5, challengeData.scoreArray.length).every(score => score === 2);
  const IFoundWord = myScoreArray.slice(myScoreArray.length -5, myScoreArray.length).every(score => score === 2);
  let result;
  // TODO: Bug on showing tied logic when i won in and they lost in six
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
      <h2>${ challengeData.name || 'Challenger' } <span class="gloat-result-trophy">${ result === 'failure' ? `🏆` : ''}</span></h2>
      <div class="gloat-result-main">
        ${ renderFullResultsPreview(challengeData.charArray, challengeData.scoreArray) }
      </div>
    </div>
    <hr/>
    <div class="gloat-result-container">
      <h2>Me <span class="gloat-result-trophy">${ result === 'success' ? '🏆' : ''}</span></h2>
      <div class="gloat-result-main">
        ${ renderFullResultsPreview(myCharArray, myScoreArray) }
      </div>
    </div>
    <button id="gloat-share-button">Share Challenge Results</button>
  `
  gloatContainer.innerHTML = innerHTML;
  // Hide share button until it's working
  gloatContainer.querySelector('#gloat-share-button').style.disply = 'none';
}

const openChallengeResultsScreen = () => {
  if(!isFinished || !challengeData){
    return;
  }
  // TODO: Reuse challenge button for gloating when in challengeMode
  document.documentElement.dataset.modal = true;
  modal.dataset.type = "gloat";
  renderChallengeResultsScreen();
}

const generateNewSecret = () => {
  let secret;
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

const newGame = (challengeData) => {
  // TODO: Move all visual gamestate clearing into function?
  renderGuessListRows();
  document.body.dataset.gamestate = undefined;
  challengeButton.style.display = 'none';
  newGameButton.style.display = 'none';
  keyboardRoot.style.display = 'flex';
  // challengeButton.disabled = true;
  isFinished = false;
  const isRestoring = restoreGameState(challengeData);
  if(isRestoring){
    // Without awaiting as initially intended, disbaling input here is
    // pretty meaningless. (I believe)
    inputDisabled = true;
    for(let i = 0; i < guesses.length; i++){
      renderGuessListRowInput(guesses[i].charArray, i);
      renderGuessListRowScore(guesses[i], i);
    }
    inputDisabled = false;
  }
  // TODO: Load saved preferences for theme
  teardownChallengeMode();
  startChallengeMode(challengeData);
  // renderRecentlySeenWordsList();
  refresh();
  console.debug(secret);
}

const onLoad = ()=> {
  document.addEventListener("guess-input-update", guessInputUpdateListener);
  document.addEventListener('keyup', keypressListener);
  keyboardRoot.addEventListener("click", touchListener);
  newGameButton.addEventListener('click', () => {
    // Ensure we don't refresh a half finished game
    clearGameStateBackup();
    newGame();
  })
  resetButton.addEventListener('click', () => localStorage.clear());
  challengeButton.addEventListener('click', () => {
    if(isFinished){
      shareChallengeLink();
    }
  })
  modalCloseButton.addEventListener('click', () => {
    document.documentElement.dataset.modal = false;
  })
  // We read for a possible seed here instead of in new game.
  // Saves us having to update the querystring to remove the seed later without
  // getting stuck playing the same word.
  const searchParams = new URLSearchParams(window.location.search);
  const challenge = searchParams.get(QUERYSTRING_CHALLENGE_KEY);
  const challengeData = challenge && processRawChallengerData(challenge); // Empty strings throw in json.parse
  // Decided to remove querystring after all. Gets rid of confusing discrepency in behavior
  // between refresh and new game button.
  // history.pushState(null, "", window.location.href.split("?")[0]);
  newGame(challengeData);
}

const gameOver = () => {
  isFinished = true;
  clearGameStateBackup();
  generateChallengerDataString();
  keyboardRoot.style.display = 'none';
  challengeButton.style.display = 'block';
  newGameButton.style.display = 'block';
  if(challengeData){
    // TODO: Listen for animation end.
    openChallengeResultsScreen();
  }
  updateHistoricalGameData(secret);
  updateHistoricalRawUserData(guesses);
}

onLoad();

// const victorySettings = {
//   // parent: document.documentElement,
//   dx: 0,
//   dy: 0.4,
//   framerate: 35,
//   color: '#46f40e',
//   density: 300,
//   radius: 10,
//   halflife: 100,
//   transparent: false,
//   backgroundColor: '#0d6540',
// }

// const field = bokehfy(victorySettings)

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
// ++ Show challenge success
// ++ Add gloat feature
// ++ Pass encrypted characters instead of score to allow showing all challengers words in results screen
// ++ BUG Wordcheck will reach challenge scores and mess up keyboard rendering
// ++ Update to pass challenge object instead of discrete keys
// ++ Generate gloat screen with all words shown instead of just score graphic
// ++ Reveal correct word on failure
// ++ BUG gloat button showing even when no challenge.
// ++ Pause keylistener and disable keybaord while letters are being revealed
// ++ Automatically show challenge results on completion
// ++ Restore focus to window after interacting with button
// ++ Delay rendering of buttons until animation finishes.
// ++ MAYBE add versioning to challenge object shape (probably should :) ) 
// ++ IMPROVE, insure correlation of secret and challenger by calculating challenger score from incoming
// ++  secret and not assumed one ass is in mvp
// ++ BUG input not getting cleared on new game
// ++ BUG Local storage recording duplicate words
// ++ Highlight invalid words and refuse submission (saves having to show an error)
// ++ Animate keyboard
// ++ Persist gamestate to sessionstorage to avoid accidental refreshes
// ++ BUG being able to submt empty guesses
// ++ BUG not triggering isfinished on sixth guess
// ++ New game button on game end.
// Responsive grid (to ensure keyboard size). Aspect-ratio not working, need JS solution
// LOGO (can be new game link as well, or hide new game in menu)
// MAYBE Prevent duplicate guesses?
// implement hard mode (implement modes in general (big refactor coming))
// Finish sharing logic (ugh)
// Share gloat screen (screenshot and share with native api or render simalacurum with canvas?)
// MAYBE Live mode? (Nah, servers needed (or just p2p, but ugh))
// Remove code for recent words (track separately from liist of used words (to support duplicates))
// MAYBE Use a UUID for identifiers to help with name collisions (two people named John) if trying to institute a
//   barebones challenge history (local storage only)
// Switch success state colors from background to buttons
// Allow setting name for sharing
// Add butter bar for validation error messages
// Move all styles to variables.
// Add restyling options
// Store style preferences in local storage
// Create statistics
// - Favorite first word
// - Favorite words
// - Graph of previous wins
// - Track scoring of each word to see what are most successful words and how often used
// ...
// Move statistics into modal
// Improve victory and defeat animations
// add pwa support for iphone
// Link to original

// lovejoy