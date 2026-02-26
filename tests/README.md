# Testing

This directory contains tests for the application logic.

## Prerequisites

- Node.js (version 14 or higher recommended)

## Running Tests

To run the unit tests for `getQuestionWeight` logic:

```bash
node tests/test_question_weight.js
```

## Test Structure

- `test_question_weight.js`: Tests the question weighting algorithm used in random mode. It mocks the browser environment using Node.js `vm` module to run `app.js` without a browser.
