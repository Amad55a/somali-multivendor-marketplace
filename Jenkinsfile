pipeline {
    agent any

    triggers {
        pollSCM('H/2 * * * *')
    }

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

        stage('Generate Prisma client') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd run prisma:generate'
            }
        }

        stage('Lint') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd run lint'
            }
        }

        stage('Unit tests') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd test'
            }
        }

        stage('TypeScript') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd run typecheck'
            }
        }

        stage('Production build') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd run build'
            }
        }

        stage('Browser end-to-end tests') {
            steps {
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npx.cmd playwright install chromium'
                bat 'set "PATH=C:/Program Files/nodejs;C:/Program Files/Git/cmd;%PATH%" && npm.cmd run test:e2e'
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
