pipeline {
    agent any

    environment {
        PATH+NODE = 'C:\\Program Files\\nodejs'
        PATH+GIT = 'C:\\Program Files\\Git\\cmd'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Environment') {
            steps {
                powershell '''
                    node --version
                    npm --version
                    git --version
                '''
            }
        }

        stage('Install dependencies') {
            steps {
                powershell 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                powershell 'npm run lint'
            }
        }

        stage('TypeScript') {
            steps {
                powershell 'npx tsc --noEmit'
            }
        }

        stage('Production build') {
            steps {
                powershell 'npm run build'
            }
        }
    }

    post {
        success {
            echo 'Marketplace CI completed successfully.'
        }
        failure {
            echo 'Marketplace CI failed. Check the stage logs.'
        }
    }
}
