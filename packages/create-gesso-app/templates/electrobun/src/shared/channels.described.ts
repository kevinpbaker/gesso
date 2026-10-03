// Written by gesso-channels from the channel contracts it names below.
// Run it again after changing a contract rather than editing this file.
import { describeChannel } from 'gesso-framework';
import { Counter } from './Counter';

describeChannel(Counter, {
  "view": {
    "type": "object",
    "properties": {
      "count": {
        "type": "number",
        "description": "The application's whole state, and it lives in the main process."
      },
      "dark": {
        "type": "boolean",
        "description": "Which appearance every window is in. One setting, all windows."
      }
    },
    "required": [
      "count",
      "dark"
    ]
  },
  "commands": {
    "increment": {
      "parameters": [
        "by"
      ],
      "input": {
        "type": "object",
        "properties": {
          "by": {
            "type": "number",
            "description": "How much to add; negative to subtract."
          }
        },
        "additionalProperties": false,
        "required": [
          "by"
        ]
      },
      "description": "Adds to the count."
    },
    "setDark": {
      "parameters": [
        "dark"
      ],
      "input": {
        "type": "object",
        "properties": {
          "dark": {
            "type": "boolean",
            "description": "True for dark."
          }
        },
        "additionalProperties": false,
        "required": [
          "dark"
        ]
      },
      "description": "Switches every window between dark and light."
    }
  },
  "description": "A counter shared by every window of the app, and whether the app is dark or light."
});
