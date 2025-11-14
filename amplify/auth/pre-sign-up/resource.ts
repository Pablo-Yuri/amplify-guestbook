import { defineFunction } from "@aws-amplify/backend";

defineFunction({
    name: 'pre-sign-up',
    resourceGroupName: 'auth'
});
