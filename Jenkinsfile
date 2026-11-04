pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Environment') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && node --version && npm.cmd --version && git --version'
            }
        }

        stage('Install dependencies') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd ci'
            }
        }

        stage('Lint') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd run lint'
            }
        }

        stage('TypeScript') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npx.cmd tsc --noEmit'
            }
        }

        stage('Production build') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd run build'
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
