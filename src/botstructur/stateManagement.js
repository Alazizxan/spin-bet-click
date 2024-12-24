const userStates = new Map();

const setState = (userId, state, data = {}) => {
    const currentState = userStates.get(userId);
    const previousState = currentState ? currentState.state : null;
    userStates.set(userId, { state, data: { ...data }, previousState });
};

const getState = (userId) => {
    return userStates.get(userId) || { state: 'START', data: {}, previousState: null };
};

module.exports = {
    setState,
    getState
};
